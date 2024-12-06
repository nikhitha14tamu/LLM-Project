import * as vscode from 'vscode';
import { scanDirectory } from './utils/fileScanner';
import { migrateCodeWithConfidence, callLLMForFixingMypyErrors } from './services/llmService';
import { runMypyCheck } from './utils/mypyRunner';
import * as fs from 'fs';
import * as path from 'path';
import { exec, execSync } from 'child_process';


// Helper function to replicate directory structure without duplicating `_py3`
function replicateDirectoryStructureWithPythonMigration(
    srcDir: string,
    destDir: string,
    pythonFiles: { srcPath: string; destPath: string }[]
): void {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);

        if (entry.isDirectory()) {
            if (entry.name === '_py3') continue; // Skip `_py3` directory
            if (!fs.existsSync(destPath)) {
                fs.mkdirSync(destPath, { recursive: true });
            }
            replicateDirectoryStructureWithPythonMigration(srcPath, destPath, pythonFiles);
        } else if (entry.name.endsWith('.py')) {
            pythonFiles.push({ srcPath, destPath: path.join(destDir, entry.name.replace('.py', '_py3.py')) });
        } else {
            fs.copyFileSync(srcPath, destPath); // Copy non-Python files directly
        }
    }
    console.debug('Replicated directory structure:', pythonFiles);
}

function createDiffDirectory(outputDir: string): string {
    const diffDir = path.join(outputDir, '_diffs');
    if (!fs.existsSync(diffDir)) {
        fs.mkdirSync(diffDir, { recursive: true });
    }
    console.debug('Diff directory created at:', diffDir);
    return diffDir;
}

function run2to3Migration(srcPath: string, outputDir: string): string {
    try {
        console.debug(`Running 2to3 on ${srcPath}...`);

        const migratedFileName = path.basename(srcPath).replace('.py', '_2to3.py');
        const migratedFilePath = path.join(outputDir, migratedFileName);

        if (!fs.existsSync(srcPath)) {
            console.error(`Source file ${srcPath} does not exist.`);
            return '';
        }

        const migratedCode = execSync(`python -m lib2to3 "${srcPath}"`, { encoding: 'utf-8' });
        if (!migratedCode.trim()) {
            console.warn(`2to3 did not produce any changes for ${srcPath}.`);
        } else {
            fs.writeFileSync(migratedFilePath, migratedCode);
            console.debug(`2to3 migrated code for ${srcPath} saved at ${migratedFilePath}`);
        }
        return migratedCode;
    } catch (error) {
        console.error(`Error running 2to3 on ${srcPath}:`, error);
        return '';
    }
}



function generateDiff(
    originalCode: string,
    migratedCode: string,
    diffFilePath: string
): void {
    try {
        console.debug(`Generating diff for file: ${diffFilePath}`);
        const originalFilePath = diffFilePath.replace(".diff", "_original.py");
        const migratedFilePath = diffFilePath.replace(".diff", "_migrated.py");

        // Write temporary files for comparison
        fs.writeFileSync(originalFilePath, originalCode.trimEnd() + "\n");
        fs.writeFileSync(migratedFilePath, migratedCode.trimEnd() + "\n");

        // Generate the diff and save it
        let diff: string;
        try {
            diff = execSync(`diff -u "${originalFilePath}" "${migratedFilePath}"`, { encoding: "utf-8" });
        } catch (error: any) {
            // If differences exist, capture the diff output
            if (error.stdout) {
                diff = error.stdout;
            } else {
                console.error(`Error generating diff for file: ${diffFilePath}`, error);
                return;
            }
        }

        fs.writeFileSync(diffFilePath, diff);
        console.debug(`Diff saved at ${diffFilePath}`);

        // Clean up temporary files
        fs.unlinkSync(originalFilePath);
        fs.unlinkSync(migratedFilePath);
    } catch (error) {
        console.error(`Error generating diff for file: ${diffFilePath}`, error);
    }
}

// Helper function to handle mypy errors and fix them with LLM
// async function fixMypyErrorsWithLLM(code: string, errors: string): Promise<string> {
//     try {
//         console.debug('Fixing mypy errors with LLM:', { code, errors });
//         const fixedCodeResponse = await migrateCodeWithConfidence(code, 'temp_output.py');
//         return fixedCodeResponse.migratedCode;
//     } catch (error) {
//         console.error('Error fixing mypy errors with LLM:', error);
//         throw new Error('Failed to fix mypy errors using the LLM.');
//     }
// }
// Pre-validation to infer type annotations or flag potential issues

function preValidateCode(code: string, workspaceFolder: string): string {
    console.debug('Running pre-validation on the code...');
    let inferredType = '';

    // Dynamically search for the `requirements.txt` file
    const requirementsPath = findRequirementsFile(workspaceFolder);

    // If `requirements.txt` is found, check Python 3 compatibility and append the result to LLM input
    if (requirementsPath) {
        console.debug('Found requirements.txt during pre-validation. Checking compatibility...');
        const compatibilityReport = checkPython3Compatibility(requirementsPath);

        if (compatibilityReport.includes('No issues detected')) {
            console.debug('Dependencies are compatible with Python 3.');
            vscode.window.showInformationMessage('Pre-Validation: All dependencies are compatible with Python 3.');
            code += `\n\n# Python 3 Compatibility Check: All dependencies are compatible with Python 3.`;
        } else {
            console.warn('Incompatible dependencies detected.');
            vscode.window.showInformationMessage(
                `Pre-Validation: Incompatible dependencies detected:\n${compatibilityReport}`
            );
            code += `\n\n# Python 3 Compatibility Check: Incompatible dependencies detected.\n${compatibilityReport}`;
        }
    } else {
        console.debug('No requirements.txt found. Skipping compatibility check.');
        vscode.window.showWarningMessage('Pre-Validation: No requirements.txt file found. Skipping compatibility check.');
    }

    if (code.includes('Dict') || code.includes('List') || code.includes('{')) {
        try {
            // Python 2.7 compatible script for detecting dictionaries
            const pythonScript = `
import ast
import sys

def detect_dicts_and_keys(code: str):
    try:
        tree = ast.parse(code)
        dicts_found = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Dict):
                keys = [ast.dump(key) for key in node.keys]
                values = [ast.dump(value) for value in node.values]
                dicts_found.append({"keys": keys, "values": values})
        if not dicts_found:
            return "No dictionaries found."
        return f"Detected dictionaries: {dicts_found}"
    except SyntaxError:
        return "SyntaxError: Unable to parse the code."
    except Exception as e:
        return f"Error: {str(e)}"

code = sys.stdin.read()
print(detect_dicts_and_keys(code))
            `;

            // Execute the Python script using Python 2.7
            inferredType = execSync(`D:\\27python\\python2.exe -c "${pythonScript}"`, { input: code }).toString().trim();

            // Log the inferred type or detection result
            console.debug('Inferred type/detection result:', inferredType);

            if (inferredType && inferredType !== 'No dictionaries found.') {
                vscode.window.showInformationMessage(
                    `Pre-Validation: Detected structures:\n${inferredType}`
                );
            } else {
                vscode.window.showInformationMessage('Pre-Validation: No dictionaries or structures detected.');
            }
        } catch (error) {
            console.error('Error during type inference:', error);
            vscode.window.showErrorMessage('Pre-Validation: Error during type inference.');
        }
    }

    // Log inferred annotations or detection and append them to the code if available
    if (inferredType && inferredType !== 'No dictionaries found.' && !inferredType.startsWith('SyntaxError')) {
        console.debug(`Detected structures: ${inferredType}`);
        return code + `\n\n# Detected structures: ${inferredType}`;
    } else {
        console.debug('No dictionaries or structures detected.');
    }

    return code;
}

function findRequirementsFile(directory: string): string | null {
    try {
        const files = fs.readdirSync(directory);
        for (const file of files) {
            if (file.toLowerCase() === 'requirements.txt') {
                return path.join(directory, file);
            }
        }
        return null;
    } catch (error) {
        console.error('Error searching for requirements.txt:', error);
        return null;
    }
}

function checkPython3Compatibility(requirementsPath: string): string {
    console.debug('Checking Python 3 compatibility for requirements...');
    try {
        // Ensure `caniusepython3` is installed
        execSync('pip install caniusepython3', { stdio: 'ignore' });

        // Run `caniusepython3` on the requirements file
        const output = execSync(`caniusepython3 -r "${requirementsPath}"`, { encoding: 'utf-8' }).trim();
        console.debug('caniusepython3 output:', output);
        return output;
    } catch (error) {
        console.error('Error checking Python 3 compatibility:', error);
        return 'Error: Unable to check Python 3 compatibility.';
    }
}

async function postValidateCode(destPath: string): Promise<string> {
    console.debug('Running post-validation on the migrated code...');
    try {
        console.debug(`Validating syntax for ${destPath}`);
        execSync(`python -m py_compile "${destPath}"`);
        console.debug(`Syntax validation passed for ${destPath}`);

        const mypyOutput = await runMypyCheck(destPath);
        console.debug(`Mypy output for ${destPath}: ${mypyOutput}`);

        return mypyOutput.trim();
    } catch (error) {
        console.error('Error during post-validation:', error);
        return `Post-validation failed: ${error instanceof Error ? error.message : String(error)}`;
    }
}



export function activate(context: vscode.ExtensionContext) {
    console.log('Extension "pythonmigrator" is now active!');

    // Register the Scan Files command
    const scanFilesCommand = vscode.commands.registerCommand('pythonmigrator.scanFiles', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder is open.');
            return;
        }

        const pythonFiles = scanDirectory(workspaceFolder);

        if (pythonFiles.length > 0) {
            vscode.window.showInformationMessage(`Found ${pythonFiles.length} Python file(s): ${pythonFiles.join(', ')}`);
        } else {
            vscode.window.showInformationMessage('No Python files found in the workspace.');
        }
    });

    // Register the Migrate Files command
    const migrateFilesCommand = vscode.commands.registerCommand('pythonmigrator.migrateFiles', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder is open.');
            return;
        }

        // const requirementsPath = path.join(workspaceFolder, 'requirements.txt');
        // if (fs.existsSync(requirementsPath)) {
        //     vscode.window.showInformationMessage(
        //         'Found requirements.txt. Checking Python 3 compatibility...'
        //     );
        //     const compatibilityReport = checkPython3Compatibility(requirementsPath);

        //     if (compatibilityReport.includes('No issues detected')) {
        //         vscode.window.showInformationMessage(
        //             'All dependencies are compatible with Python 3.'
        //         );
        //     } else {
        //         vscode.window.showErrorMessage(
        //             'Incompatible dependencies detected:\n' + compatibilityReport
        //         );
        //         return; // Stop migration if dependencies are not compatible
        //     }
        // }
    
        const pythonFiles: { srcPath: string; destPath: string }[] = [];
        const outputDir = path.join(workspaceFolder, '_py3');
    
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
    
        replicateDirectoryStructureWithPythonMigration(workspaceFolder, outputDir, pythonFiles);
    
        if (pythonFiles.length === 0) {
            vscode.window.showInformationMessage('No Python files found for migration.');
            return;
        }
        
        const diffDir = createDiffDirectory(outputDir);
        const reportFilePath = path.join(outputDir, 'migration_report.txt');
        const reportLines: string[] = [];
        
        
    
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Migrating Python Files...',
                cancellable: false,
            },
            async (progress) => {
                let completedFiles = 0;
    
                for (const { srcPath, destPath } of pythonFiles) {
                    try {
                        progress.report({
                            message: `Migrating ${srcPath}`,
                            increment: (1 / pythonFiles.length) * 100,
                        });
                        
                        const originalCode = fs.readFileSync(srcPath, 'utf-8');
                        console.debug('Original code:', originalCode);
                        
                        const preValidatedCode = preValidateCode(originalCode, workspaceFolder);
                        let { migratedCode: llmMigratedCode, confidence } = await migrateCodeWithConfidence(preValidatedCode, destPath);
                        console.debug('LLM migrated code and confidence:', { llmMigratedCode, confidence });
    
                        let iterations = 0;
                        const maxIterations = 2;
                        let mypyOutput = '';
                        let bestCodeSoFar = llmMigratedCode; // Initialize with the original migrated code
                        let bestConfidenceSoFar = confidence; // Initialize with the original confidence
                        let bestLineCountSoFar = llmMigratedCode.split('\n').length; 
    
                        while (iterations < maxIterations) {
    fs.writeFileSync(destPath, llmMigratedCode);

    
    
    try {
        // Validate syntax
        // console.debug(`Validating syntax for ${destPath}`);
        // // execSync(`python -m py_compile "${destPath}"`);
        // console.debug(`Syntax validation passed for ${destPath}`);

        // Run mypy
        console.debug(`Running mypy for ${destPath}`);
        mypyOutput = await runMypyCheck(destPath);
        console.debug(`Mypy output for ${destPath}: ${mypyOutput}`);

        if (mypyOutput.trim().startsWith('Success:')) {
            // No mypy errors, stop further attempts
            reportLines.push(
                `File: ${srcPath}\nConfidence Score: ${bestConfidenceSoFar.toFixed(
                    2
                )}\nMypy Analysis: No issues found.\n\n`
            );
            console.debug(`No issues found for ${destPath}, stopping iteration.`);
            break;
        } else {
            // Call LLM to fix mypy errors
            console.debug(`Calling LLM fixer for iteration ${iterations + 1}`);
            const fixResponse = await callLLMForFixingMypyErrors(llmMigratedCode, mypyOutput, confidence);
            const fixedCodeLineCount = fixResponse.fixedCode.split('\n').length;

            if (fixedCodeLineCount - bestLineCountSoFar > 10) {
                bestCodeSoFar = fixResponse.fixedCode;
                bestConfidenceSoFar = fixResponse.confidence; // Update confidence for the "best code"
                bestLineCountSoFar = fixedCodeLineCount;
                console.debug('Updated best code and confidence based on line count:', {
                    bestLineCountSoFar,
                    bestConfidenceSoFar,
                });
                llmMigratedCode = fixResponse.fixedCode;
                confidence = fixResponse.confidence;
            } else {
                console.debug('Retaining previous best code and confidence as line count is lower.');
                llmMigratedCode = bestCodeSoFar; // Revert migratedCode to the best so far
                confidence = bestConfidenceSoFar;
            }

           
            // fs.writeFileSync(destPath, bestCodeSoFar);
            console.debug('Fixed code and updated confidence:', { bestCodeSoFar, bestConfidenceSoFar });
        }
    } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error during validation or mypy check: ${errMessage}`);
        reportLines.push(`File: ${srcPath}\nError: ${errMessage}\n\n`);
        break;
    }

    iterations++;
}
fs.writeFileSync(destPath, llmMigratedCode);



// Perform post-validation on the best code before finalizing
const postValidationResult = await postValidateCode(destPath);
console.debug('Post-validation result:', postValidationResult);

if (iterations === maxIterations && !mypyOutput.trim().startsWith('Success:')) {
    if (!postValidationResult.startsWith('Success:')) {
        console.warn(
            `Post-validation failed for ${destPath}. Adding to report with issues.`
        );
        reportLines.push(
            `File: ${srcPath}\nConfidence Score: ${bestConfidenceSoFar.toFixed(
                2
            )}\nMypy Analysis: Failed after ${maxIterations} attempts.\nPost-validation Analysis: Issues detected.\n\n`
        );
    } else {
        console.debug(
            `Post-validation passed for ${destPath}. Adding to report as failed but valid.`
        );
        reportLines.push(
            `File: ${srcPath}\nConfidence Score: ${bestConfidenceSoFar.toFixed(
                2
            )}\nMypy Analysis: Failed after ${maxIterations} attempts.\nPost-validation Analysis: No issues found.\n\n`
        );
    }
}

const twoToThreeMigratedCode = run2to3Migration(srcPath, outputDir);

                            // Generate the diff
                            const diffFilePath = path.join(diffDir, `${path.basename(srcPath, '.py')}.diff`);
                            generateDiff(llmMigratedCode, twoToThreeMigratedCode, diffFilePath);

                            // reportLines.push(`File: ${srcPath}\nConfidence Score: ${confidence.toFixed(2)}\nDiff generated at: ${diffFilePath}\n\n`);

completedFiles++;
} catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error migrating file ${srcPath}:`, errMessage);
    reportLines.push(
        `File: ${srcPath}\nError: ${errMessage}\n\n`
    );
}
}

// Write migration report
fs.writeFileSync(reportFilePath, reportLines.join(''), 'utf-8');
vscode.window.showInformationMessage(
    `Migration completed. ${completedFiles}/${pythonFiles.length} files migrated successfully. Report saved to ${reportFilePath}`
);

            }
        );
    });
    
    context.subscriptions.push(scanFilesCommand, migrateFilesCommand);
}

export function deactivate() {}

// Helper function to clean up mypy output
function extractMypyErrors(mypyOutput: string): string {
    return mypyOutput
        .split('\n')
        .filter((line) => !line.startsWith('LOG:')) // Remove LOG lines
        .join('\n')
        .trim();
}
