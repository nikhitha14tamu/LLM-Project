import * as fs from 'fs';
import * as path from 'path';

export function scanDirectory(dir: string): string[] {
    let files: string[] = [];
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            files = files.concat(scanDirectory(fullPath));
        } else if (file.endsWith('.py')) {
            files.push(fullPath);
        }
    });
    return files;
}
