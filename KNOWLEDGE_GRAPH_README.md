# Knowledge Graph Quick Start

## Overview

The knowledge graph provides a comprehensive map of the Portable Document Formatter codebase, capturing architecture, dependencies, and relationships.

## Files

| File | Size | Description |
|------|------|-------------|
| `knowledge-graph.json` | 35KB | Machine-readable graph data (87 nodes, 142 edges) |
| `knowledge-graph-visualization.html` | 18KB | Interactive D3.js visualization |
| `KNOWLEDGE_GRAPH.md` | 32KB | Comprehensive documentation (800+ lines) |

## Quick Access

### View Interactive Visualization

```bash
# macOS
open knowledge-graph-visualization.html

# Linux
xdg-open knowledge-graph-visualization.html

# Windows
start knowledge-graph-visualization.html
```

### Read Documentation

```bash
# View in terminal
cat KNOWLEDGE_GRAPH.md

# Open in default editor
open KNOWLEDGE_GRAPH.md
```

### Query Programmatically

```javascript
const graph = require('./knowledge-graph.json');

// Find all main process files
const mainProcessFiles = graph.nodes.filter(n =>
  graph.edges.some(e =>
    e.source === 'main-process' && e.target === n.id
  )
);

// Find dependencies of PDFViewer
const pdfViewerDeps = graph.edges
  .filter(e => e.source === 'PDFViewer.tsx' && e.type === 'imports')
  .map(e => graph.nodes.find(n => n.id === e.target));

// Get workflow steps
const saveFlow = graph.workflows.find(w => w.id === 'save-export');
console.log(saveFlow.steps);
```

## What's Inside

### Graph Structure

- **87 Nodes**: Files, layers, concepts, dependencies
- **142 Edges**: Imports, dependencies, IPC calls, relationships

### Node Types

- **Layer** (4): Main process, renderer, services, workers
- **File** (40): TypeScript/TSX source files
- **Concept** (3): IPC bridge, state management, layer composition
- **Dependency** (7): External libraries (electron, react, pdf-lib, etc.)

### Edge Types

- `belongs-to`: File belongs to architectural layer
- `imports`: Module import relationship
- `depends-on`: External dependency
- `uses`: Service or API usage
- `implements`: Pattern implementation
- `connects-to`: IPC communication
- `delegates-to`: Delegation pattern
- `triggers`: Event triggering

### Workflows

1. **Document Loading** (11 steps)
2. **Save/Export** (13 steps)
3. **Annotation Creation** (8 steps)
4. **Text Editing** (12 steps)
5. **Search Execution** (13 steps)

## Visualization Features

### Interactive Controls

- **Zoom**: Mouse wheel or pinch gesture
- **Pan**: Click and drag background
- **Drag Nodes**: Click and drag individual nodes
- **Hover**: View detailed information in tooltip

### Filters

- **Filter by Type**: Show only layers, files, concepts, or dependencies
- **Filter by Layer**: Show only nodes in main process, renderer, services, or workers
- **Reset View**: Return to initial state
- **Center Graph**: Re-center the visualization

### Visual Legend

- **Purple**: Layers
- **Green**: Files
- **Orange**: Concepts
- **Purple (darker)**: Dependencies

## Common Queries

### Find All Components

```javascript
const components = graph.nodes.filter(n =>
  n.path && n.path.includes('components/')
);
```

### Find IPC Channels

```javascript
const ipcEdges = graph.edges.filter(e =>
  e.type === 'triggers' || e.type === 'connects-to'
);
```

### Find Service Dependencies

```javascript
const serviceDeps = graph.edges.filter(e =>
  e.source.includes('service') && e.type === 'depends-on'
);
```

### Get File Responsibilities

```javascript
const file = graph.nodes.find(n => n.id === 'PDFViewer.tsx');
console.log(file.responsibilities);
```

## Documentation Sections

The comprehensive documentation (`KNOWLEDGE_GRAPH.md`) includes:

1. **Architecture Overview** - Multi-process design
2. **Layer Breakdown** - Main, renderer, services, workers
3. **Critical Workflows** - Step-by-step sequences
4. **Dependency Graph** - External and internal dependencies
5. **Data Models** - Core types and interfaces
6. **Security Analysis** - Security checklist and attack surface
7. **Performance Considerations** - Optimizations and bottlenecks
8. **Testing Infrastructure** - Unit, UI, and E2E tests
9. **Build and Distribution** - Development and production builds
10. **Known Limitations** - Unimplemented features and technical debt
11. **Extension Points** - How to add new features
12. **Metrics Summary** - Codebase statistics

## Use Cases

### For New Developers

- Understand overall architecture
- Identify entry points for features
- Learn component relationships
- See data flow patterns

### For Maintainers

- Plan refactoring efforts
- Identify dependencies before changes
- Understand impact of modifications
- Document architectural decisions

### For Security Auditors

- Map attack surface
- Verify security boundaries
- Check IPC handler exposure
- Validate isolation patterns

### For Performance Engineers

- Identify bottlenecks
- Understand rendering pipeline
- Optimize critical paths
- Plan performance improvements

## Support

For questions about the knowledge graph or to request additional analysis:

1. Check `KNOWLEDGE_GRAPH.md` for detailed documentation
2. Use the interactive visualization for visual exploration
3. Query `knowledge-graph.json` programmatically for automation
4. Refer to the original issue for context

---

**Generated**: 2026-04-18
**Agent**: Electron JS Architect
**Version**: 1.0.0
