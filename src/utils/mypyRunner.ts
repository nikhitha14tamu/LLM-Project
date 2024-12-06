import { exec } from 'child_process';

export async function runMypyCheck(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        
        const command = `mypy "${filePath}" --show-error-codes`;

        exec(command, (error, stdout, stderr) => {
            if (stderr) {
                reject(stderr);
                return;
            }

            // Extract only relevant lines from mypy output
            const cleanedOutput = stdout
                .split('\n')
                .filter((line) => !line.startsWith('LOG:')) // Remove LOG lines
                .join('\n')
                .trim();

            resolve(cleanedOutput);
        });
    });
}
