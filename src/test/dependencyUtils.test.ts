// import { extractFunctionDependencies, topologicalSort } from '../utils/dependencyUtils';

// test('extractFunctionDependencies', () => {
//     const code = `
//         def A():
//             B()
//             C()

//         def B():
//             print("Hello")

//         def C():
//             D()

//         def D():
//             print("World")
//     `;
//     const dependencies = extractFunctionDependencies(code);
//     expect(dependencies.get('A')).toEqual(new Set(['B', 'C']));
//     expect(dependencies.get('C')).toEqual(new Set(['D']));
// });

// test('topologicalSort', () => {
//     const dependencies = new Map<string, Set<string>>([
//         ['A', new Set(['B', 'C'])],
//         ['B', new Set()],
//         ['C', new Set(['D'])],
//         ['D', new Set()],
//     ]);
//     const sorted = topologicalSort(dependencies);
//     expect(sorted).toEqual(['D', 'C', 'B', 'A']); // Topological order
// });
