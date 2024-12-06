import axios from 'axios';
import * as vscode from 'vscode';
import {
    extractFunctionDependencies,
    topologicalSort,
    createDependencyAwareChunks,
} from '../utils/dependencyUtils';
import fs from 'fs';

// Function to clean LLM response
export function cleanLLMResponse(response: string): string {
    const lines = response.split('\n');
    let startIndex = 0;
    let endIndex = lines.length;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('```python')) {
            startIndex = i + 1; // Start after ```python
        }
        if (lines[i].includes('```') && i > startIndex) {
            endIndex = i; // End before ```
            break;
        }
    }

    const cleanedLines = lines.slice(startIndex, endIndex).join('\n').trim();

    // Remove "Confidence Score" line if present
    return cleanedLines.replace(/Confidence Score:.*$/m, '').trim();
}

// Sleep function to add delay between requests
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}


// Main migration function with dependency-aware chunks
// Main migration function with dependency-aware chunks
export async function migrateCodeWithConfidence(
    code: string,
    outputPath: string,
    chunkSize: number = 500
): Promise<{ migratedCode: string; confidence: number }> {
    try {
        console.log('Extracting dependencies...');
        const dependencies = extractFunctionDependencies(code);
        console.log('Extracted dependencies:', dependencies);

        const sortedFunctions = topologicalSort(dependencies);
        console.log('Topologically sorted functions:', sortedFunctions);

        // Create dependency-aware chunks
        const chunks = createDependencyAwareChunks(code, dependencies,chunkSize);
        console.log('Generated chunks for migration:', chunks);

        let migratedCode = '';
        let totalConfidence = 0;

        // Step 3: Process chunks
        for (const chunk of chunks) {
            try {
                // If no functions detected, treat as a single chunk and process
                const hasFunctions = Array.from(dependencies.keys()).some((fn) =>
                    chunk.includes(`def ${fn}(`)
                );

                if (!hasFunctions || chunks.length === 1) {
                    console.log('Processing non-function script or single chunk...');
                    const { migratedCode: chunkCode, confidence } = await migrateChunk(chunk);
                    if (chunkCode.trim()) {
                        migratedCode += chunkCode + '\n';
                        totalConfidence += confidence;
                    } else {
                        console.error('Empty response for chunk:', chunk);
                        migratedCode += chunk + '\n'; // Fallback to original chunk
                    }
                } else {
                    // Process function-based chunks
                    console.log(`Processing chunk with functions: ${chunk}`);
                    const { migratedCode: chunkCode, confidence } = await migrateChunk(chunk);
                    migratedCode += chunkCode + '\n';
                    totalConfidence += confidence;
                }
            } catch (error) {
                console.error('Error processing chunk:', error);
                migratedCode += chunk + '\n'; // Fallback to original chunk
            }
        }

        const averageConfidence = chunks.length > 0 ? totalConfidence / chunks.length : 0;

        if (!migratedCode.trim()) {
            throw new Error('No migrated code was generated.');
        }

        fs.writeFileSync(outputPath, migratedCode.trim(), 'utf-8');
        console.log(`Migrated code written to: ${outputPath}`);

        return { migratedCode: migratedCode.trim(), confidence: averageConfidence };
    } catch (error) {
        console.error('Error during migration:', error);
        throw new Error('Failed to migrate code.');
    }
}

// Function to migrate a single chunk
async function migrateChunk(chunk: string): Promise<{ migratedCode: string; confidence: number }> {
    try {
        // const apiKey = 'Key'; // Replace with your actual API key
        // if (!apiKey) {
        //     vscode.window.showErrorMessage('Please configure your OpenAI API key in the settings to use Python Migrator.');
        //     // return { migratedCode: '', confidence: 0 }; // Return a default value or handle appropriately
        // }
        let apiKey = process.env.OPENAI_API_KEY;
        console.debug(process.env.OPENAI_API_KEY);
        console.debug('Sending chunk to LLM:', chunk);

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `You are a Python migration expert. Your job is to convert Python 2 code to Python 3.1, including type annotations for variables using the typing module. Fix all issues flagged by mypy.`,
                    },
                    {
                        role: 'user',
                        content: `Convert the following Python 2 code to Python 3.1, ensuring:
1. Output only valid Python 3.1 code. Do not include any extra labels, comments, or metadata such as \`\`\`python.
2. Use valid Python 3.1 syntax.
3. Include type annotations for all variables (e.g., List, Dict, Tuple, etc.).
4. Fix any potential mypy errors,Fix any potential mypy errors, like Callable[[int], int]: .
5. Replace deprecated libraries and functions with their Python 3 equivalents (e.g., urllib2 → urllib.request).
6. Include all necessary imports for Python 3 equivalents.
7. Avoid duplicating previously migrated functions or definitions.
8. Provide a confidence score between 0-100 as "Confidence Score: <score>" at the end of the response.
9. Ensure the migrated code passes mypy validation with no errors.

Here is the code to migrate:
${chunk}`,
                    },
                ],
                max_tokens: 1500,
                temperature: 0,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
            }
        );

        const result = response.data.choices[0].message.content;
        const cleanedResponse = cleanLLMResponse(result);

        // Extract confidence score
        const confidenceMarker = 'Confidence Score:';
        const confidenceIndex = result.indexOf(confidenceMarker);

        if (confidenceIndex === -1) {
            throw new Error('Confidence Score not found in LLM response');
        }

        const confidenceString = result.substring(confidenceIndex + confidenceMarker.length).trim();
        const confidence = parseFloat(confidenceString);

        if (isNaN(confidence)) {
            throw new Error(`Invalid confidence score: ${confidenceString}`);
        }

        return {
            migratedCode: cleanedResponse,
            confidence,
        };
    } catch (error) {
        console.error('Error migrating chunk:', error);
        throw new Error(`Failed to migrate chunk: ${error}`);
    }
}


export async function callLLMForFixingMypyErrors(
    code: string,
    errors: string,
    confidence: number
): Promise<{ fixedCode: string; confidence: number }> {
    const oldconf = confidence;
    try {
        // const apiKey = vscode.workspace.getConfiguration('pythonMigrator').get<string>('apiKey') || '';
        // if (!apiKey) {
        //     vscode.window.showErrorMessage('Please configure your OpenAI API key in the settings to use Python Migrator.');
        //     // return { migratedCode: '', confidence: 0 }; // Return a default value or handle appropriately
        // }
                
 // Replace with your actual API key
        console.debug('Entering LLM fixer with code and errors:', { code, errors });
        let apiKey = process.env.OPENAI_API_KEY;
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are an expert in resolving mypy errors for Python 3.1 code.' },
                    {
                        role: 'user',
                        content: `The following Python 3.1 code has mypy errors. Fix the code to resolve these errors and generate a confidence score:

Code:
${code}

Mypy Errors:
${errors}

1. Please ensure the fixed code is valid Python 3.1, adheres to type annotations, and resolves all mypy errors. 

2. If the data structure does not match the provided type annotations, update the annotations to reflect the actual data structure. 
3. Prioritize preserving the functionality of the code while ensuring it passes mypy checks.
4. If necessary, include Union types to allow mixed data types where appropriate.
5. Please provide an explanation for your changes as a comment in the fixed code.
6. Ensure the fixed code is valid Python 3.1 and adheres to type annotations.
7. If you think there are errors then give the input code as it is.
8. Please do not miss any part of the given code.

Please include "Confidence Score: <score>" in your response, where <score> represents your confidence in the correctness of the fixed code and is between 0-100 .`,

                    },
                ],
                max_tokens: 1200,
                temperature: 0,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
            }
        );

        console.debug('LLM response received - fixer:', response.data);

        const result = response.data.choices[0].message.content;
        const cleanedResponse = cleanLLMResponse(result);

        const confidenceMarker = 'Confidence Score:';
        const confidenceIndex = result.indexOf(confidenceMarker);
        let confidence = oldconf;
        if (confidenceIndex === -1) {
            console.error('Confidence score not found in LLM response - fixer.');
            //throw new Error('Confidence Score not found in LLM response - fixer');
        }else{

            const confidenceString = result.substring(confidenceIndex + confidenceMarker.length).trim();
            confidence = parseFloat(confidenceString);
    
            if (isNaN(confidence)) {
                console.error(`Invalid confidence score - fixer: ${confidenceString}`);
                throw new Error(`Invalid confidence score - fixer: ${confidenceString}`);
            }
        }


        console.debug('Returning fixed code and confidence - fixer:', { cleanedResponse, confidence });
        return { fixedCode: cleanedResponse, confidence };
    } catch (error) {
        console.error('Error occurred in LLM fixer:');
        if (error instanceof Error) {
            console.error(`Error message - fixer: ${error.message}`);
            throw new Error(`Failed to fix mypy errors - fixer: ${error.message}`);
        } else {
            console.error(`Unknown error - fixer: ${JSON.stringify(error)}`);
            throw new Error(`Failed to fix mypy errors - fixer: Unknown error encountered`);
        }
    }
}
