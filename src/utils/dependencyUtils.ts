// Extract dependencies between functions
export function extractFunctionDependencies(content: string): Map<string, Set<string>> {
    const dependencies = new Map<string, Set<string>>();
    const lines = content.split('\n');
    let currentFunction = '';

    for (const line of lines) {
        const functionMatch = line.match(/^def\s+(\w+)/);
        if (functionMatch) {
            currentFunction = functionMatch[1];
            dependencies.set(currentFunction, new Set());
        } else if (currentFunction) {
            const calledFunctions = Array.from(dependencies.keys()).filter((fn) =>
                line.includes(`${fn}(`)
            );
            for (const fn of calledFunctions) {
                dependencies.get(currentFunction)?.add(fn);
            }
        }
    }

    console.debug('Extracted dependencies:', dependencies);
    return dependencies;
}


// Perform topological sort to resolve dependencies
export function topologicalSort(dependencies: Map<string, Set<string>>): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();

    const visit = (node: string) => {
        if (visited.has(node)) return;
        visited.add(node);

        const deps = dependencies.get(node) || [];
        for (const dep of deps) {
            visit(dep);
        }
        sorted.push(node);
    };

    for (const node of dependencies.keys()) {
        visit(node);
    }

    console.debug('Topologically sorted functions:', sorted);
    return sorted.reverse();
}



export function createDependencyAwareChunks(
    content: string,
    dependencies: Map<string, Set<string>>,
    maxLinesPerChunk: number = 500
): string[] {
    const lines = content.split('\n');
    if (lines.length <= maxLinesPerChunk) {
        console.debug('Total lines are <= 500; returning content as a single chunk.');
        return [content];
    }

    
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentChunkSize = 0;

    let isInFunction = false;
    let currentFunctionLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Detect function start
        const functionMatch = line.match(/^def\s+\w+\s*\(/);

        if (functionMatch) {
            // If already inside a function, complete the current function
            if (isInFunction) {
                // Check if adding the current function exceeds chunk size
                if (currentChunkSize + currentFunctionLines.length > maxLinesPerChunk) {
                    // Finalize current chunk
                    chunks.push(currentChunk.join('\n'));
                    currentChunk = [];
                    currentChunkSize = 0;
                }

                // Add current function to the chunk
                currentChunk.push(...currentFunctionLines);
                currentChunkSize += currentFunctionLines.length;
            }

            // Start a new function
            isInFunction = true;
            currentFunctionLines = [line];
        } else if (isInFunction) {
            // Continue collecting function lines
            currentFunctionLines.push(line);

            // If at the last line, finalize the current function
            if (i === lines.length - 1) {
                if (currentChunkSize + currentFunctionLines.length > maxLinesPerChunk) {
                    // Finalize current chunk
                    chunks.push(currentChunk.join('\n'));
                    currentChunk = [];
                    currentChunkSize = 0;
                }

                currentChunk.push(...currentFunctionLines);
                currentChunkSize += currentFunctionLines.length;
            }
        } else {
            // Non-function code (imports, global variables, etc.)
            if (currentChunkSize + 1 > maxLinesPerChunk) {
                chunks.push(currentChunk.join('\n'));
                currentChunk = [];
                currentChunkSize = 0;
            }

            currentChunk.push(line);
            currentChunkSize++;
        }
    }

    // Add remaining lines to the last chunk
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n'));
    }

    console.debug('Created dependency-aware chunks:', chunks);
    console.debug(chunks);
    return chunks;
}



// Helper function to split large chunks by size
function splitChunkBySize(chunk: string, chunkSize: number): string[] {
    const lines = chunk.split('\n');
    const result: string[] = [];
    let currentChunk: string[] = [];

    for (const line of lines) {
        if (currentChunk.join('\n').length + line.length > chunkSize) {
            result.push(currentChunk.join('\n'));
            currentChunk = [];
        }
        currentChunk.push(line);
    }

    if (currentChunk.length > 0) {
        result.push(currentChunk.join('\n'));
    }

    return result;
}
