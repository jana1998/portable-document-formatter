# Portable Document Formatter: Architecture Evolution Roadmap

## Executive Summary

This roadmap outlines the strategic evolution of the Portable Document Formatter's OCR and document processing capabilities. The plan addresses three major initiatives:

1. **Retiring Tesseract.js** and replacing it with **Microsoft MarkItDown** for superior multi-format document extraction
2. **Adding LLM Connectors** to enable AI-powered document understanding
3. **Implementing LLM-based structured extraction** for intelligent data capture

**Timeline**: 3 phases over 6-8 months
**Risk Level**: Medium (architectural changes with backward compatibility)
**Business Impact**: High (enables AI-powered document workflows, reduces technical debt)

---

## Table of Contents

- [Current State Analysis](#current-state-analysis)
- [Target Architecture](#target-architecture)
- [Phase 1: Foundation & Migration (Months 1-2)](#phase-1-foundation--migration-months-1-2)
- [Phase 2: LLM Integration (Months 3-4)](#phase-2-llm-integration-months-3-4)
- [Phase 3: Intelligent Extraction (Months 5-6)](#phase-3-intelligent-extraction-months-5-6)
- [Architecture Decision Records](#architecture-decision-records)
- [Risk Assessment & Mitigation](#risk-assessment--mitigation)
- [Success Metrics](#success-metrics)

---

## Current State Analysis

### Existing OCR Implementation

| Aspect | Current State | Limitations |
|--------|--------------|-------------|
| **Engine** | Tesseract.js 5.0.4 (WASM) | PDF-only, English-only, ~5-10s/page |
| **Architecture** | Renderer-thread blocking | Freezes UI during processing |
| **Formats** | PDF via canvas extraction | No Word, Excel, PowerPoint, images |
| **Output** | Plain text extraction | No structure preservation |
| **Persistence** | In-memory only | Lost on app close |
| **Intelligence** | None | No semantic understanding |

**Key Findings**:
- Well-architected Electron app (React 18, Zustand, TypeScript)
- Clean IPC abstraction enables backend swaps
- Unused Web Worker infrastructure ready for activation
- Strong UI/UX foundation (Radix UI, Tailwind CSS)

### Why MarkItDown?

**Microsoft MarkItDown** is a Python-based document converter optimized for LLM consumption:

| Feature | MarkItDown | Tesseract.js |
|---------|------------|--------------|
| **Formats** | PDF, DOCX, PPTX, XLSX, Images, Audio, HTML, ZIP | PDF only (via canvas) |
| **Structure** | Preserves headings, lists, tables, links | Plain text |
| **LLM Ready** | Markdown output optimized for tokens | Raw OCR text |
| **Vision** | Supports LLM image description | OCR-only |
| **Performance** | Native Python + optional Azure | WASM in browser |
| **Architecture** | Stream-based, modular plugins | Monolithic WASM |

**Trade-offs**:
- **Gain**: Multi-format support, structure preservation, LLM optimization
- **Lose**: Pure client-side processing (requires Python backend)
- **Mitigate**: Hybrid approach with fallback to client-side

---

## Target Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Electron Renderer (React)                  │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────────────┐  │
│  │  PDFViewer   │  │  OCRDialog  │  │ ExtractionDialog     │  │
│  │              │  │             │  │ (new)                │  │
│  └──────┬───────┘  └──────┬──────┘  └──────────┬───────────┘  │
│         │                 │                     │               │
│  ┌──────┴─────────────────┴─────────────────────┴──────────┐  │
│  │           Zustand Store (State Management)              │  │
│  │  - documentState, ocrResults, extractionResults         │  │
│  └──────────────────────────┬──────────────────────────────┘  │
└─────────────────────────────┼─────────────────────────────────┘
                              │ IPC (preload.ts)
┌─────────────────────────────┼─────────────────────────────────┐
│                    Electron Main Process                       │
│  ┌──────────────────────────┴──────────────────────────────┐  │
│  │          Document Processing Service (new)              │  │
│  │  ┌────────────────────────────────────────────────┐    │  │
│  │  │  Backend Abstraction Layer (Strategy Pattern)  │    │  │
│  │  │  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │    │  │
│  │  │  │MarkItDown│  │Tesseract │  │  Cloud OCR  │  │    │  │
│  │  │  │ (Primary)│  │(Fallback)│  │  (Optional) │  │    │  │
│  │  │  └──────────┘  └──────────┘  └─────────────┘  │    │  │
│  │  └────────────────────────────────────────────────┘    │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │            LLM Connector Service (new)                  │  │
│  │  ┌────────────┐  ┌───────────┐  ┌──────────────────┐  │  │
│  │  │  OpenAI    │  │ Anthropic │  │  Local (Ollama)  │  │  │
│  │  │  Adapter   │  │  Adapter  │  │     Adapter      │  │  │
│  │  └────────────┘  └───────────┘  └──────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │       Structured Extraction Service (new)               │  │
│  │  - Schema validation (Zod)                              │  │
│  │  - JSON Schema → LLM prompt conversion                  │  │
│  │  - Retry logic with validation                          │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │                    │
            ┌───────┴────────┐   ┌──────┴────────┐
            │ Python Backend │   │  LLM APIs     │
            │  (MarkItDown)  │   │  (External)   │
            └────────────────┘   └───────────────┘
```

### Key Architectural Decisions

1. **Backend Service Architecture** (not pure Electron): Spawn Python subprocess for MarkItDown
2. **Strategy Pattern for OCR Backends**: Pluggable engines (MarkItDown, Tesseract, Cloud)
3. **LLM Connector Abstraction**: Provider-agnostic with adapter pattern
4. **Schema-Driven Extraction**: Zod schemas define extraction targets

---

## Phase 1: Foundation & Migration (Months 1-2)

### Objective
Replace Tesseract.js with MarkItDown while maintaining backward compatibility and improving architecture.

### Initiatives

#### 1.1 MarkItDown Backend Integration (2 weeks)

**Tasks**:
- Create Python microservice wrapping MarkItDown
  - FastAPI server with `/convert` endpoint
  - Input: file upload (multipart/form-data)
  - Output: JSON with `{markdown: string, metadata: object}`
- Add subprocess management in Electron main process
  - Spawn Python server on app start
  - Health check endpoint
  - Graceful shutdown on app close
- Create IPC handlers: `document:convert`, `markitdown:health`

**Implementation Details**:
```typescript
// src/main/services/markitdown-service.ts
export class MarkItDownService {
  private pythonProcess: ChildProcess | null = null;
  private serverUrl = 'http://localhost:8765';

  async start() {
    // Check Python availability
    // Spawn: python -m markitdown_server
    // Wait for health check
  }

  async convertDocument(filePath: string, options: ConvertOptions): Promise<ConversionResult> {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    formData.append('options', JSON.stringify(options));

    const response = await fetch(`${this.serverUrl}/convert`, {
      method: 'POST',
      body: formData
    });

    return response.json();
  }
}
```

**Python Service** (`markitdown_server/main.py`):
```python
from fastapi import FastAPI, File, UploadFile
from markitdown import MarkItDown
import tempfile

app = FastAPI()
md = MarkItDown()

@app.post("/convert")
async def convert_document(file: UploadFile):
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    result = md.convert(tmp_path)
    return {
        "markdown": result.text_content,
        "metadata": {
            "title": result.title,
            "format": file.content_type
        }
    }

@app.get("/health")
async def health():
    return {"status": "ok"}
```

**Acceptance Criteria**:
- ✓ Python server starts automatically with Electron
- ✓ Converts PDF to Markdown via IPC
- ✓ Handles server failures gracefully (retry + fallback)

#### 1.2 Backend Abstraction Layer (2 weeks)

**Objective**: Create pluggable OCR backend system using Strategy Pattern.

**Architecture**:
```typescript
// src/main/services/document-processor/types.ts
export interface DocumentProcessor {
  name: string;
  supports(filePath: string): boolean;
  process(filePath: string, options: ProcessOptions): Promise<ProcessResult>;
}

export interface ProcessResult {
  content: string;
  format: 'markdown' | 'text';
  pages?: PageResult[];
  metadata?: Record<string, any>;
}

// src/main/services/document-processor/processors/markitdown-processor.ts
export class MarkItDownProcessor implements DocumentProcessor {
  constructor(private markitdownService: MarkItDownService) {}

  name = 'MarkItDown';

  supports(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.pdf', '.docx', '.pptx', '.xlsx', '.png', '.jpg'].includes(ext);
  }

  async process(filePath: string, options: ProcessOptions): Promise<ProcessResult> {
    const result = await this.markitdownService.convertDocument(filePath, options);
    return {
      content: result.markdown,
      format: 'markdown',
      metadata: result.metadata
    };
  }
}

// src/main/services/document-processor/processors/tesseract-processor.ts
export class TesseractProcessor implements DocumentProcessor {
  // Fallback for when Python unavailable
}

// src/main/services/document-processor/index.ts
export class DocumentProcessorService {
  private processors: DocumentProcessor[] = [];

  registerProcessor(processor: DocumentProcessor) {
    this.processors.push(processor);
  }

  async processDocument(filePath: string, options: ProcessOptions): Promise<ProcessResult> {
    const processor = this.processors.find(p => p.supports(filePath));
    if (!processor) {
      throw new Error(`No processor found for ${filePath}`);
    }
    return processor.process(filePath, options);
  }
}
```

**Acceptance Criteria**:
- ✓ Multiple processors can be registered
- ✓ Auto-selects best processor based on file type
- ✓ Graceful fallback if primary processor fails

#### 1.3 Multi-Format Support UI (1 week)

**Tasks**:
- Update `OCRDialog.tsx` to support multiple file types
- Add format detection badge (PDF, DOCX, Image, etc.)
- Display Markdown-formatted results with proper rendering
- Add export options (Markdown, Plain Text, JSON)

**UI Changes**:
```typescript
// OCRDialog now becomes DocumentConverterDialog
<Dialog>
  <DialogContent>
    <div className="space-y-4">
      <FileInfo format={detectedFormat} processor={activeProcessor} />

      <Tabs defaultValue="preview">
        <TabsList>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="markdown">Markdown</TabsTrigger>
          <TabsTrigger value="raw">Raw Text</TabsTrigger>
        </TabsList>

        <TabsContent value="preview">
          <MarkdownRenderer content={result.content} />
        </TabsContent>

        <TabsContent value="markdown">
          <CodeBlock language="markdown" content={result.content} />
        </TabsContent>
      </Tabs>

      <ExportButtons formats={['md', 'txt', 'json']} />
    </div>
  </DialogContent>
</Dialog>
```

#### 1.4 Result Persistence (1 week)

**Objective**: Cache processing results to avoid reprocessing.

**Implementation**:
- Use IndexedDB for browser-side caching (Dexie.js)
- Key: `${fileHash}_${processor}_${version}`
- Store: `{content, format, metadata, timestamp, processorVersion}`

```typescript
// src/renderer/services/cache-service.ts
import Dexie from 'dexie';

interface CachedResult {
  id?: number;
  fileHash: string;
  processor: string;
  version: string;
  content: string;
  format: string;
  metadata: any;
  timestamp: number;
}

class CacheDatabase extends Dexie {
  results!: Dexie.Table<CachedResult, number>;

  constructor() {
    super('DocumentProcessorCache');
    this.version(1).stores({
      results: '++id, &[fileHash+processor+version], timestamp'
    });
  }
}

export class CacheService {
  private db = new CacheDatabase();

  async get(fileHash: string, processor: string, version: string): Promise<CachedResult | undefined> {
    return this.db.results
      .where('[fileHash+processor+version]')
      .equals([fileHash, processor, version])
      .first();
  }

  async set(result: CachedResult) {
    await this.db.results.add(result);
  }

  async clear(olderThan: number) {
    await this.db.results.where('timestamp').below(olderThan).delete();
  }
}
```

### Phase 1 Deliverables

- ✓ Python backend service for MarkItDown
- ✓ Subprocess lifecycle management in Electron
- ✓ Backend abstraction with Strategy pattern
- ✓ Multi-format document conversion UI
- ✓ IndexedDB result caching
- ✓ Backward compatibility with existing PDF workflow

**Effort Estimate**: 6 weeks (1 developer)
**Risk Level**: Medium (Python dependency, subprocess management)

---

## Phase 2: LLM Integration (Months 3-4)

### Objective
Add LLM connectivity layer to enable AI-powered document understanding and processing.

### Initiatives

#### 2.1 LLM Connector Architecture (2 weeks)

**Design Principles**:
1. **Provider Agnostic**: Support OpenAI, Anthropic, local models (Ollama)
2. **Adapter Pattern**: Normalize different API formats
3. **Streaming Support**: Handle both sync and streaming responses
4. **Error Handling**: Retry logic, rate limiting, fallback

**Core Abstractions**:
```typescript
// src/main/services/llm/types.ts
export interface LLMProvider {
  name: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
  embeddings?(texts: string[]): Promise<number[][]>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ContentPart {
  type: 'text' | 'image';
  text?: string;
  image?: { url: string } | { base64: string };
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: 'json_object' | 'text' };
}

// src/main/services/llm/providers/openai-provider.ts
import OpenAI from 'openai';

export class OpenAIProvider implements LLMProvider {
  name = 'OpenAI';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: options?.model || 'gpt-4o',
      messages: this.adaptMessages(messages),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      response_format: options?.responseFormat
    });

    return {
      content: response.choices[0].message.content,
      usage: response.usage
    };
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions) {
    const stream = await this.client.chat.completions.create({
      model: options?.model || 'gpt-4o',
      messages: this.adaptMessages(messages),
      stream: true
    });

    for await (const chunk of stream) {
      yield {
        content: chunk.choices[0]?.delta?.content || '',
        done: chunk.choices[0]?.finish_reason !== null
      };
    }
  }
}

// src/main/services/llm/providers/anthropic-provider.ts
import Anthropic from '@anthropic-ai/sdk';

export class AnthropicProvider implements LLMProvider {
  name = 'Anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const { system, messages: adaptedMessages } = this.adaptMessages(messages);

    const response = await this.client.messages.create({
      model: options?.model || 'claude-3-5-sonnet-20241022',
      system,
      messages: adaptedMessages,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature
    });

    return {
      content: response.content[0].type === 'text' ? response.content[0].text : '',
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens
      }
    };
  }
}

// src/main/services/llm/providers/ollama-provider.ts
export class OllamaProvider implements LLMProvider {
  name = 'Ollama';
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options?.model || 'llama2',
        messages,
        stream: false
      })
    });

    const data = await response.json();
    return {
      content: data.message.content,
      usage: {} // Ollama doesn't provide token usage
    };
  }
}

// src/main/services/llm/llm-service.ts
export class LLMService {
  private providers = new Map<string, LLMProvider>();
  private activeProvider: string = 'openai';

  registerProvider(name: string, provider: LLMProvider) {
    this.providers.set(name, provider);
  }

  setActiveProvider(name: string) {
    if (!this.providers.has(name)) {
      throw new Error(`Provider ${name} not registered`);
    }
    this.activeProvider = name;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const provider = this.providers.get(this.activeProvider);
    if (!provider) {
      throw new Error(`Active provider ${this.activeProvider} not found`);
    }
    return provider.chat(messages, options);
  }
}
```

**Configuration Management**:
```typescript
// src/main/config/llm-config.ts
export interface LLMConfig {
  providers: {
    openai?: { apiKey: string; defaultModel?: string };
    anthropic?: { apiKey: string; defaultModel?: string };
    ollama?: { baseUrl: string; defaultModel?: string };
  };
  activeProvider: string;
}

// Store in electron-store for persistence
import Store from 'electron-store';

const configStore = new Store<{ llm: LLMConfig }>({
  defaults: {
    llm: {
      providers: {},
      activeProvider: 'openai'
    }
  }
});
```

**IPC Handlers**:
```typescript
// src/main/main.ts
ipcMain.handle('llm:chat', async (_, messages, options) => {
  return llmService.chat(messages, options);
});

ipcMain.handle('llm:configure', async (_, config: LLMConfig) => {
  // Validate and save config
  configStore.set('llm', config);
  // Re-initialize providers
  await initializeLLMProviders();
});

ipcMain.handle('llm:getConfig', async () => {
  return configStore.get('llm');
});
```

#### 2.2 LLM Configuration UI (1 week)

**Settings Panel**:
```typescript
// src/renderer/components/features/settings/LLMSettings.tsx
export function LLMSettings() {
  const [config, setConfig] = useState<LLMConfig | null>(null);

  useEffect(() => {
    window.electronAPI.llm.getConfig().then(setConfig);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>LLM Configuration</CardTitle>
        <CardDescription>
          Configure AI providers for document understanding
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-4">
          <Label>Active Provider</Label>
          <Select value={config?.activeProvider} onValueChange={handleProviderChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
              <SelectItem value="ollama">Ollama (Local)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {config?.activeProvider === 'openai' && (
          <div className="space-y-4">
            <Label>OpenAI API Key</Label>
            <Input
              type="password"
              value={config.providers.openai?.apiKey}
              onChange={handleApiKeyChange}
              placeholder="sk-..."
            />
            <Label>Default Model</Label>
            <Select value={config.providers.openai?.defaultModel}>
              <SelectContent>
                <SelectItem value="gpt-4o">GPT-4 Optimized</SelectItem>
                <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Similar blocks for Anthropic and Ollama */}

        <Button onClick={handleSave}>Save Configuration</Button>
      </CardContent>
    </Card>
  );
}
```

#### 2.3 Document Intelligence Features (2 weeks)

**Use Cases**:
1. **Summarization**: Generate executive summary from document
2. **Q&A**: Ask questions about document content
3. **Translation**: Translate extracted text to other languages
4. **Classification**: Auto-categorize documents

**Implementation Example - Document Summarization**:
```typescript
// src/main/services/document-intelligence-service.ts
export class DocumentIntelligenceService {
  constructor(private llmService: LLMService) {}

  async summarize(markdown: string, options?: SummarizeOptions): Promise<Summary> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a document analysis assistant. Provide concise, accurate summaries.'
      },
      {
        role: 'user',
        content: `Summarize the following document:\n\n${markdown}\n\nProvide:\n1. A brief overview (2-3 sentences)\n2. Key points (bullet list)\n3. Main topics covered`
      }
    ];

    const response = await this.llmService.chat(messages, {
      temperature: 0.3,
      maxTokens: 1000
    });

    return {
      overview: extractOverview(response.content),
      keyPoints: extractKeyPoints(response.content),
      topics: extractTopics(response.content),
      fullSummary: response.content
    };
  }

  async askQuestion(markdown: string, question: string): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant that answers questions about documents accurately. Only use information from the provided document.'
      },
      {
        role: 'user',
        content: `Document:\n\n${markdown}\n\nQuestion: ${question}`
      }
    ];

    const response = await this.llmService.chat(messages, {
      temperature: 0.2
    });

    return response.content;
  }

  async classify(markdown: string, categories: string[]): Promise<Classification> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a document classification assistant. Classify documents into provided categories with confidence scores.'
      },
      {
        role: 'user',
        content: `Document:\n\n${markdown}\n\nCategories: ${categories.join(', ')}\n\nRespond in JSON format: {"category": "...", "confidence": 0.95, "reasoning": "..."}`
      }
    ];

    const response = await this.llmService.chat(messages, {
      temperature: 0.1,
      responseFormat: { type: 'json_object' }
    });

    return JSON.parse(response.content);
  }
}
```

**UI - Intelligence Panel**:
```typescript
// src/renderer/components/features/intelligence/IntelligencePanel.tsx
export function IntelligencePanel() {
  const { currentDocument, processingResult } = usePDFStore();
  const [activeTab, setActiveTab] = useState('summarize');

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="summarize">Summarize</TabsTrigger>
          <TabsTrigger value="qa">Q&A</TabsTrigger>
          <TabsTrigger value="classify">Classify</TabsTrigger>
        </TabsList>

        <TabsContent value="summarize">
          <SummarizeView markdown={processingResult?.content} />
        </TabsContent>

        <TabsContent value="qa">
          <QuestionAnswerView markdown={processingResult?.content} />
        </TabsContent>

        <TabsContent value="classify">
          <ClassificationView markdown={processingResult?.content} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### Phase 2 Deliverables

- ✓ LLM provider abstraction (OpenAI, Anthropic, Ollama)
- ✓ Settings UI for API key management
- ✓ Document summarization feature
- ✓ Q&A interface for document queries
- ✓ Auto-classification capability
- ✓ Streaming response support

**Effort Estimate**: 5 weeks (1 developer)
**Risk Level**: Low (well-defined APIs, incremental features)

---

## Phase 3: Intelligent Extraction (Months 5-6)

### Objective
Enable schema-driven structured data extraction from documents using LLMs.

### Initiatives

#### 3.1 Schema Definition System (2 weeks)

**Use Zod for Runtime Validation**:
```typescript
// src/main/services/extraction/schemas.ts
import { z } from 'zod';

// Example: Invoice extraction schema
export const invoiceSchema = z.object({
  invoiceNumber: z.string().describe('The invoice number'),
  date: z.string().datetime().describe('Invoice date in ISO 8601 format'),
  vendor: z.object({
    name: z.string(),
    address: z.string().optional(),
    taxId: z.string().optional()
  }),
  customer: z.object({
    name: z.string(),
    address: z.string().optional()
  }),
  lineItems: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    total: z.number()
  })),
  subtotal: z.number(),
  tax: z.number().optional(),
  total: z.number()
});

export type Invoice = z.infer<typeof invoiceSchema>;

// Schema registry
export const schemaRegistry = new Map<string, z.ZodSchema>([
  ['invoice', invoiceSchema],
  ['receipt', receiptSchema],
  ['contract', contractSchema],
  ['resume', resumeSchema]
]);

// Convert Zod schema to JSON Schema for LLM
export function zodToJsonSchema(schema: z.ZodSchema): object {
  // Use zod-to-json-schema library
  return zodToJsonSchema(schema);
}
```

**User-Defined Schemas**:
```typescript
// src/renderer/components/features/extraction/SchemaBuilder.tsx
export function SchemaBuilder() {
  const [schemaName, setSchemaName] = useState('');
  const [fields, setFields] = useState<Field[]>([]);

  const addField = () => {
    setFields([...fields, {
      name: '',
      type: 'string',
      description: '',
      required: true
    }]);
  };

  const saveSchema = async () => {
    const zodCode = generateZodCode(fields);
    await window.electronAPI.extraction.saveSchema(schemaName, zodCode);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Extraction Schema</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Input
            placeholder="Schema name (e.g., 'invoice')"
            value={schemaName}
            onChange={e => setSchemaName(e.target.value)}
          />

          {fields.map((field, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder="Field name"
                value={field.name}
                onChange={e => updateField(i, 'name', e.target.value)}
              />
              <Select value={field.type} onValueChange={v => updateField(i, 'type', v)}>
                <SelectContent>
                  <SelectItem value="string">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="boolean">Yes/No</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="array">List</SelectItem>
                  <SelectItem value="object">Nested Object</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Description"
                value={field.description}
                onChange={e => updateField(i, 'description', e.target.value)}
              />
            </div>
          ))}

          <Button onClick={addField}>Add Field</Button>
          <Button onClick={saveSchema}>Save Schema</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

#### 3.2 LLM Extraction Engine (2 weeks)

**Core Extraction Logic**:
```typescript
// src/main/services/extraction/extraction-service.ts
export class ExtractionService {
  constructor(private llmService: LLMService) {}

  async extract(
    markdown: string,
    schema: z.ZodSchema,
    options?: ExtractionOptions
  ): Promise<ExtractionResult> {
    const jsonSchema = zodToJsonSchema(schema);
    const maxRetries = options?.maxRetries || 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const messages: ChatMessage[] = [
          {
            role: 'system',
            content: `You are a precise data extraction assistant. Extract information from documents according to the provided JSON schema. Return ONLY valid JSON matching the schema.`
          },
          {
            role: 'user',
            content: `Document:\n\n${markdown}\n\nExtract data matching this schema:\n${JSON.stringify(jsonSchema, null, 2)}\n\nReturn only the JSON object, no explanations.`
          }
        ];

        const response = await this.llmService.chat(messages, {
          temperature: 0.1,
          responseFormat: { type: 'json_object' }
        });

        // Parse and validate
        const extracted = JSON.parse(response.content);
        const validated = schema.parse(extracted);

        return {
          success: true,
          data: validated,
          attempt,
          confidence: this.calculateConfidence(extracted, schema)
        };

      } catch (error) {
        if (attempt === maxRetries) {
          return {
            success: false,
            error: error.message,
            attempt
          };
        }
        // Retry with guidance based on validation error
        if (error instanceof z.ZodError) {
          // Add validation errors to next prompt
          messages.push({
            role: 'assistant',
            content: response.content
          });
          messages.push({
            role: 'user',
            content: `Validation failed: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}. Please correct and return valid JSON.`
          });
        }
      }
    }
  }

  private calculateConfidence(data: any, schema: z.ZodSchema): number {
    // Heuristic: check field completeness, value quality
    let score = 0;
    const fields = Object.keys(data);

    // Completeness: all required fields present
    score += fields.length > 0 ? 0.5 : 0;

    // Quality: non-empty strings, valid numbers
    const nonEmptyFields = fields.filter(k => {
      const val = data[k];
      return val !== null && val !== undefined && val !== '';
    });
    score += (nonEmptyFields.length / fields.length) * 0.5;

    return Math.min(score, 1.0);
  }
}
```

**Multi-Modal Extraction** (for images with text):
```typescript
async extractWithVision(
  imagePath: string,
  schema: z.ZodSchema
): Promise<ExtractionResult> {
  const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });
  const jsonSchema = zodToJsonSchema(schema);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'You are a precise data extraction assistant. Extract information from images according to the provided JSON schema.'
    },
    {
      role: 'user',
      content: [
        {
          type: 'image',
          image: { base64: imageBase64 }
        },
        {
          type: 'text',
          text: `Extract data from this image matching the schema:\n${JSON.stringify(jsonSchema, null, 2)}`
        }
      ]
    }
  ];

  const response = await this.llmService.chat(messages, {
    model: 'gpt-4o', // Vision-capable model
    temperature: 0.1,
    responseFormat: { type: 'json_object' }
  });

  const extracted = JSON.parse(response.content);
  return { success: true, data: schema.parse(extracted) };
}
```

#### 3.3 Extraction UI & Workflow (2 weeks)

**Extraction Dialog**:
```typescript
// src/renderer/components/features/extraction/ExtractionDialog.tsx
export function ExtractionDialog() {
  const [selectedSchema, setSelectedSchema] = useState<string>('');
  const [extractionResult, setExtractionResult] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { processingResult } = usePDFStore();

  const handleExtract = async () => {
    setIsProcessing(true);
    try {
      const result = await window.electronAPI.extraction.extract(
        processingResult.content,
        selectedSchema
      );
      setExtractionResult(result);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Structured Data Extraction</DialogTitle>
          <DialogDescription>
            Extract structured data from this document using AI
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-4">
            <Label>Extraction Schema</Label>
            <Select value={selectedSchema} onValueChange={setSelectedSchema}>
              <SelectTrigger>
                <SelectValue placeholder="Select schema..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="invoice">Invoice</SelectItem>
                <SelectItem value="receipt">Receipt</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="resume">Resume</SelectItem>
                <SelectItem value="custom">Custom Schema...</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={handleExtract}
              disabled={!selectedSchema || isProcessing}
            >
              {isProcessing ? 'Extracting...' : 'Extract Data'}
            </Button>

            {extractionResult && (
              <div className="space-y-2">
                <Label>Confidence</Label>
                <Progress value={extractionResult.confidence * 100} />

                <div className="flex gap-2">
                  <Button onClick={handleExportJSON}>Export JSON</Button>
                  <Button onClick={handleExportCSV}>Export CSV</Button>
                  <Button onClick={handleCopyToClipboard}>Copy</Button>
                </div>
              </div>
            )}
          </div>

          <div className="border rounded-lg p-4 bg-muted">
            <Label>Extracted Data</Label>
            {extractionResult ? (
              <JsonViewer data={extractionResult.data} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a schema and click Extract to see results
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JsonViewer({ data }: { data: any }) {
  return (
    <pre className="text-xs overflow-auto max-h-[400px]">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
```

**Batch Extraction**:
```typescript
// Process multiple documents with same schema
export async function batchExtract(
  filePaths: string[],
  schemaName: string,
  onProgress: (current: number, total: number) => void
): Promise<BatchResult> {
  const results: ExtractionResult[] = [];

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];

    // Convert document to markdown
    const processed = await window.electronAPI.document.convert(filePath);

    // Extract
    const extracted = await window.electronAPI.extraction.extract(
      processed.content,
      schemaName
    );

    results.push({ filePath, ...extracted });
    onProgress(i + 1, filePaths.length);
  }

  return {
    total: filePaths.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results
  };
}
```

#### 3.4 Export & Integration (1 week)

**Export Formats**:
- JSON (structured data)
- CSV (tabular data, works for array schemas)
- Excel (using exceljs for formatted output)
- Database (SQLite or cloud DB connectors)

**Implementation**:
```typescript
// src/main/services/extraction/export-service.ts
import ExcelJS from 'exceljs';
import Database from 'better-sqlite3';

export class ExportService {
  async exportToJson(data: any, filePath: string): Promise<void> {
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  async exportToCsv(data: any[], filePath: string): Promise<void> {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('CSV export requires array of objects');
    }

    const headers = Object.keys(data[0]);
    const rows = data.map(obj => headers.map(h => obj[h]));

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    await fs.promises.writeFile(filePath, csv);
  }

  async exportToExcel(data: any[], filePath: string, schemaName: string): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(schemaName);

    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      worksheet.addRow(headers);

      data.forEach(obj => {
        worksheet.addRow(headers.map(h => obj[h]));
      });

      // Style headers
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    }

    await workbook.xlsx.writeFile(filePath);
  }

  async exportToSqlite(
    data: any[],
    dbPath: string,
    tableName: string,
    schema: z.ZodSchema
  ): Promise<void> {
    const db = new Database(dbPath);

    // Create table from schema
    const createTableSql = this.generateCreateTableSql(tableName, schema);
    db.exec(createTableSql);

    // Insert data
    if (data.length > 0) {
      const fields = Object.keys(data[0]);
      const placeholders = fields.map(() => '?').join(', ');
      const insertSql = `INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders})`;

      const insert = db.prepare(insertSql);

      for (const record of data) {
        insert.run(...fields.map(f => record[f]));
      }
    }

    db.close();
  }
}
```

### Phase 3 Deliverables

- ✓ Zod-based schema definition system
- ✓ Visual schema builder UI
- ✓ LLM-powered extraction engine with validation
- ✓ Retry logic with error correction
- ✓ Multi-modal extraction (text + images)
- ✓ Batch processing for multiple documents
- ✓ Export to JSON, CSV, Excel, SQLite
- ✓ Confidence scoring and quality metrics

**Effort Estimate**: 7 weeks (1 developer)
**Risk Level**: Medium (LLM accuracy depends on model quality)

---

## Architecture Decision Records

### ADR-001: Adopt MarkItDown for Multi-Format Document Processing

**Status**: Accepted

**Context**:
Current Tesseract.js implementation is limited to PDF OCR with poor structure preservation. Users need to process Word documents, PowerPoint, Excel, and images. MarkItDown offers multi-format support with Markdown output optimized for LLM consumption.

**Decision**:
Replace Tesseract.js with Microsoft MarkItDown as the primary document processing engine.

**Consequences**:

**Positive**:
- Multi-format support (PDF, DOCX, PPTX, XLSX, images, HTML, etc.)
- Structure preservation (headings, lists, tables)
- LLM-optimized Markdown output
- Better OCR quality with optional Azure Document Intelligence integration
- Modular plugin system for extensibility

**Negative**:
- Requires Python runtime (not pure JavaScript)
- Adds complexity with subprocess management
- Users need Python installed (or bundle Python with app)
- Cannot run entirely client-side (security consideration for sensitive docs)

**Mitigation**:
- Bundle Python with Electron app using PyInstaller
- Implement fallback to Tesseract.js if Python unavailable
- Provide clear error messages for Python dependency issues
- Offer offline mode with bundled Python

---

### ADR-002: Use Adapter Pattern for LLM Provider Abstraction

**Status**: Accepted

**Context**:
Multiple LLM providers exist (OpenAI, Anthropic, local models). Each has different APIs, pricing, and capabilities. Users should be able to switch providers without code changes.

**Decision**:
Implement an adapter pattern with a common `LLMProvider` interface. Each provider (OpenAI, Anthropic, Ollama) implements this interface with provider-specific logic encapsulated in adapter classes.

**Consequences**:

**Positive**:
- Provider-agnostic application code
- Easy to add new providers
- Users can switch providers based on cost/performance
- Supports local models (privacy for sensitive documents)
- Testable with mock providers

**Negative**:
- Abstraction layer adds complexity
- Must normalize different API formats (messages, responses, errors)
- Some provider-specific features may be lost in normalization

**Mitigation**:
- Allow provider-specific options to pass through when needed
- Document provider differences and capabilities
- Provide sensible defaults for cross-provider compatibility

---

### ADR-003: Schema-Driven Extraction with Zod

**Status**: Accepted

**Context**:
Structured data extraction from documents requires defining expected output formats. LLMs can extract data but often hallucinate or return inconsistent structures. Need runtime validation and type safety.

**Decision**:
Use Zod for schema definition with runtime validation. Convert Zod schemas to JSON Schema for LLM prompts. Validate LLM output against Zod schema before returning to user.

**Consequences**:

**Positive**:
- Type-safe extraction results
- Runtime validation catches LLM errors
- Schemas are developer-friendly (TypeScript integration)
- JSON Schema generation enables LLM understanding
- Composable schemas for complex documents
- Automatic type inference

**Negative**:
- Additional dependency (Zod)
- Schemas must be defined upfront (not fully dynamic)
- Validation errors require retry logic

**Mitigation**:
- Provide pre-built schemas for common document types
- Visual schema builder for non-developers
- Retry with error feedback to LLM for self-correction
- Graceful degradation to unstructured extraction

---

### ADR-004: Hybrid Python Subprocess Architecture

**Status**: Accepted

**Context**:
MarkItDown requires Python runtime. Electron is Node.js-based. Need to bridge the two environments efficiently.

**Decision**:
Run MarkItDown as a FastAPI microservice spawned as subprocess by Electron main process. Communicate via HTTP (localhost).

**Alternatives Considered**:
1. **Python shell scripts**: Call Python CLI for each conversion
   - Rejected: High startup overhead per request
2. **Python C extensions**: Native Node.js bindings
   - Rejected: Complex build process, platform-specific
3. **Separate Python server**: User runs Python service manually
   - Rejected: Poor UX, deployment complexity

**Consequences**:

**Positive**:
- Clean separation of concerns (Electron ↔ Python)
- Persistent Python process (no startup overhead per request)
- Standard HTTP interface (easy to test, monitor)
- Can move to remote service later without code changes
- Graceful degradation if Python unavailable

**Negative**:
- Port management (find available port, avoid conflicts)
- Process lifecycle management (start, health check, shutdown)
- Security: localhost server could be accessed by other apps
- Bundling Python adds to app size

**Mitigation**:
- Use dynamic port allocation
- Implement health checks and auto-restart
- Bind to 127.0.0.1 only (localhost)
- Bundle minimal Python distribution (PyInstaller)
- Provide installation script for dev setup

---

## Risk Assessment & Mitigation

### Technical Risks

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| **Python dependency issues** | Medium | High | Bundle Python with app; fallback to Tesseract.js |
| **LLM API rate limits** | Medium | Medium | Implement retry with exponential backoff; show clear errors |
| **LLM extraction accuracy** | High | Medium | Validation with retry; confidence scoring; manual review UI |
| **Subprocess crashes** | Low | High | Health checks; auto-restart; graceful error handling |
| **Large document performance** | Medium | Medium | Streaming processing; progress indicators; chunking |
| **Security (API keys)** | Medium | High | electron-store encryption; never log keys; secure IPC |

### Business Risks

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| **User adoption low** | Low | Medium | Gradual rollout; keep existing features working |
| **Cost of LLM usage** | Medium | Medium | Local model option; usage tracking; cost estimates |
| **Competitor features** | Medium | Low | Focus on unique value (offline, privacy, multi-format) |
| **Support burden** | Medium | Medium | Comprehensive docs; error messages; debug logging |

### Migration Risks

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| **Breaking existing workflows** | Low | High | Maintain backward compatibility; gradual deprecation |
| **Data loss** | Low | Critical | Backup existing results; migration script |
| **Performance regression** | Medium | Medium | Benchmarking; performance testing; optimization |

---

## Success Metrics

### Phase 1 Success Criteria

- ✓ 95% of PDF conversions succeed with MarkItDown
- ✓ Support for at least 5 file formats (PDF, DOCX, PPTX, XLSX, images)
- ✓ Conversion time < 15 seconds for typical documents (< 50 pages)
- ✓ Python subprocess uptime > 99.5%
- ✓ Zero data loss from cache system
- ✓ User satisfaction score > 4.0/5.0

### Phase 2 Success Criteria

- ✓ Support for 3 LLM providers (OpenAI, Anthropic, Ollama)
- ✓ API key configuration success rate > 95%
- ✓ Summarization quality rated "good" or "excellent" in 80% of cases
- ✓ Q&A accuracy > 85% on test dataset
- ✓ Average response time < 5 seconds for summarization

### Phase 3 Success Criteria

- ✓ Extraction accuracy > 90% for structured fields (invoice, receipt schemas)
- ✓ Validation success rate > 85% (first attempt)
- ✓ Support for at least 5 pre-built schemas
- ✓ User-defined schema creation success > 80%
- ✓ Batch processing throughput > 10 documents/minute
- ✓ Export success rate > 99%

### Overall Business Metrics

- **User Engagement**: 30% increase in daily active users
- **Retention**: 15% improvement in 30-day retention
- **Feature Usage**: 40% of users try LLM features within first week
- **Conversion**: 20% increase in free-to-paid conversion (if applicable)
- **Support Tickets**: < 5% increase despite new features

---

## Appendix: Technology Choices

### Dependencies to Add

**Phase 1**:
```json
{
  "dependencies": {
    "dexie": "^3.2.4",
    "node-fetch": "^3.3.2"
  },
  "devDependencies": {
    "pyinstaller": "For bundling Python"
  }
}
```

**Phase 2**:
```json
{
  "dependencies": {
    "openai": "^4.28.0",
    "@anthropic-ai/sdk": "^0.17.0",
    "electron-store": "^8.1.0"
  }
}
```

**Phase 3**:
```json
{
  "dependencies": {
    "zod": "^3.22.4",
    "zod-to-json-schema": "^3.22.4",
    "exceljs": "^4.4.0",
    "better-sqlite3": "^9.4.3"
  }
}
```

### Python Environment (MarkItDown Service)

**requirements.txt**:
```
fastapi==0.109.0
uvicorn==0.27.0
markitdown==0.1.0
python-multipart==0.0.9
```

**Build for Distribution**:
```bash
# Create standalone Python executable
pyinstaller markitdown_server/main.py \
  --onefile \
  --name markitdown-service \
  --hidden-import=markitdown \
  --add-data "requirements.txt:."
```

---

## Timeline Summary

| Phase | Duration | Key Deliverables | Dependencies |
|-------|----------|------------------|--------------|
| **Phase 1** | 6 weeks | MarkItDown integration, multi-format support | Python runtime |
| **Phase 2** | 5 weeks | LLM connectors, document intelligence | Phase 1 complete |
| **Phase 3** | 7 weeks | Structured extraction, export | Phase 2 complete |
| **Buffer** | 3 weeks | Bug fixes, polish, documentation | - |
| **Total** | 21 weeks (~5 months) | Full platform ready | - |

**Staffing**: 1 full-time developer (can parallelize with 2 developers to reduce to 3-4 months)

---

## Next Steps

### Immediate Actions (Week 1)

1. **Technical Validation**:
   - [ ] Verify Python bundling with PyInstaller on all platforms (macOS, Windows)
   - [ ] Benchmark MarkItDown performance on representative documents
   - [ ] Test subprocess lifecycle (start, crash recovery, shutdown)

2. **Architecture Approval**:
   - [ ] Review this roadmap with engineering team
   - [ ] Get security review for LLM connector design
   - [ ] Obtain budget approval for LLM API costs (if cloud-based)

3. **Repository Setup**:
   - [ ] Create feature branch: `feature/markitdown-integration`
   - [ ] Set up Python project structure
   - [ ] Configure CI/CD for Python + Electron builds

4. **Prototyping**:
   - [ ] Build minimal MarkItDown subprocess proof-of-concept
   - [ ] Create mockups for new UI components
   - [ ] Test LLM API integration (OpenAI, Anthropic)

---

## Conclusion

This roadmap provides a pragmatic, phased approach to evolving the Portable Document Formatter into an AI-powered document intelligence platform. By retiring Tesseract.js in favor of MarkItDown, adding LLM connectivity, and implementing schema-driven extraction, we enable new use cases while maintaining the application's core strengths: clean architecture, user experience, and reliability.

The three-phase structure allows for incremental delivery with regular checkpoints. Each phase delivers standalone value while building toward the final vision. Risks are identified and mitigated, and success metrics ensure we validate assumptions at every stage.

**The architecture is designed to survive the team that builds it** — modular, well-documented, with clear boundaries and trade-offs explicitly named.
