// utils/headerExtractor.ts

// Extracts headers such as imports, class definitions, and function signatures
export function extractHeader(content: string): string {
    const lines = content.split('\n'); // Split content into lines
    const header = [];
    for (const line of lines) {
        // Extract imports and class/function definitions
        if (line.startsWith('import') || line.startsWith('from')) {
            header.push(line); // Add import statements
        } else if (line.startsWith('def ') || line.startsWith('class ')) {
            header.push(line.split('(')[0]); // Add function or class signature
        }
    }
    return header.join('\n'); // Join headers into a single string
}
