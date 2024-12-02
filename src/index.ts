#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

type Node = {
  text: string;
  parentId: string | null;
};

type SavedTree = {
  nodes: { [id: string]: Node };
  currentNodeId: string | null;
};

type ConversationState = {
  conversationId: string | null;
  lastSaveName: string | null;
};

const nodes: { [id: string]: Node } = {};
let currentNodeId: string | null = null;
let anthropicClient: Anthropic;
let state: ConversationState = {
  conversationId: null,
  lastSaveName: null
};

const DEFAULT_SETTINGS = {
  maxTokens: 256,
  temperature: 1,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  n: 5,
  systemPrompt:
    "The assistant is in CLI simulation mode, and responds to the user's CLI commands only with the output of the command.",
  userMessage: "<cmd>cat untitled.txt</cmd>",
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAVES_DIR = path.join(__dirname, '.loom-saves');

function truncateText(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

const server = new Server(
  {
    name: "loom-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  }
);

function getNodeTree(nodeId: string, depth = 0): string {
  const node = nodes[nodeId];
  const children = Object.entries(nodes)
    .filter(([_, n]) => n.parentId === nodeId)
    .map(([id]) => id);

  let result = "  ".repeat(depth) + `${nodeId}: ${truncateText(node.text)}\n`;
  for (const childId of children) {
    result += getNodeTree(childId, depth + 1);
  }
  return result;
}

async function autosaveCurrentTree() {
  if (!state.conversationId) return;
  
  const saveName = `conversation_${state.conversationId}`;
  await fs.mkdir(SAVES_DIR, { recursive: true });
  await fs.writeFile(
    path.join(SAVES_DIR, `${saveName}.json`),
    JSON.stringify({ nodes, currentNodeId } as SavedTree, null, 2)
  );
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "loom_init",
        description: "Initialize the tree with a root text. This will clear any existing tree.",
        inputSchema: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "Initial text to start the tree",
            },
          },
          required: ["text"],
        },
      },
      {
        name: "loom_complete",
        description: "Generate multiple new possibilities branching from your focused node. Each completion becomes a new child node.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "loom_select",
        description: "Selects a node to become the context for the next completion. You must use trim and/or add parameters to open up possibilities; branches with unmodified endings often do not lead to more completions.",
        inputSchema: {
          type: "object",
          properties: {
            nodeId: {
              type: "string",
              description: "ID of the node to select",
            },
            trimmedText: {
              type: "string",
              description: "Allows trimming the node text by repeating a prefix of the original text to keep. Must match the start of the original text exactly.",
            },
            add: {
              type: "string",
              description: "Up to ten characters to append to the node text. Useful to guide the direction of future completions.",
            }
          },
          required: ["nodeId"],
        },
      },
      {
        name: "loom_show_path",
        description: "Prints the complete text from root to current focused node. It can be difficult for the human to follow your explorations, so use this to show them the current thread.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "loom_set_conversation",
        description: "Initialize or restore a conversation's tree state. Call with no args at the start of each conversation to get a new ID. If the tree is empty when it shouldn't be, call with the previous conversation ID to restore the state.",
        inputSchema: {
          type: "object",
          properties: {
            conversationId: {
              type: "string",
              description: "Optional. Previous conversation ID to restore that conversation's state."
            }
          },
        }
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  let response;
  try {
    switch (request.params.name) {
      case "loom_init": {
        const text = request.params.arguments!.text as string;
        if (!text) {
          throw new Error("Initial text is required");
        }

        // Clear any existing nodes
        Object.keys(nodes).forEach((key) => delete nodes[key]);

        // Create root node
        const rootId = Math.random().toString(36).substring(7);
        nodes[rootId] = {
          text,
          parentId: null,
        };
        currentNodeId = rootId;

        response = {
          content: [
            {
              type: "text",
              text: `Initialized tree with root node ${rootId}`,
            },
          ],
        };
        break;
      }

      case "loom_complete": {
        if (!currentNodeId) {
          throw new Error("No current node selected");
        }

        // Build full context by traversing up the tree
        let contextText = [];
        let nodeId: string | null = currentNodeId;
        while (nodeId !== null) {
          const node: Node = nodes[nodeId];
          contextText.unshift(node.text);
          nodeId = node.parentId;
        }
        const fullContext = contextText.join(" ");

        // Generate completions in parallel
        const completionPromises = Array(DEFAULT_SETTINGS.n).fill(null).map(() => 
          anthropicClient.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: DEFAULT_SETTINGS.maxTokens,
            temperature: DEFAULT_SETTINGS.temperature,
            system: DEFAULT_SETTINGS.systemPrompt,
            messages: [
              {
                role: "user",
                content: DEFAULT_SETTINGS.userMessage,
              },
              {
                role: "assistant",
                content: fullContext,
              },
            ],
          })
        );

        const completions = await Promise.all(completionPromises);
        const newNodes = completions
          .map(completion => {
            const generatedText = completion.content?.[0]?.text ?? "";
            if (!generatedText) return null; // Skip empty text
            
            const newId = Math.random().toString(36).substring(7);
            nodes[newId] = {
              text: generatedText,
              parentId: currentNodeId,
            };
            return { id: newId, text: generatedText };
          })
          .filter(node => node !== null); // Remove null entries

        const blankCount = completions.length - newNodes.length;

        if (newNodes.length === 0) {
          throw new Error("No new completions were generated. Don't be discouraged! You can try trimming or adding to the node text, selecting a different node, or starting over with a new root node.");
        }

        response = {
          content: [
            {
              type: "text",
              text: `Created ${newNodes.length} new nodes${blankCount > 0 ? ` (${blankCount} were blank)` : ''}:\n${newNodes
                .map((node) => `${node.id}: ${node.text}`)
                .join("\n")}`,
            },
          ],
        };
        break;
      }

      case "loom_select": {
        const nodeId = request.params.arguments?.nodeId as string;
        const trimmedText = request.params.arguments?.trimmedText as string;
        const add = request.params.arguments?.add as string;
        
        if (!nodeId || !nodes[nodeId]) {
          throw new Error(`Node ${nodeId} not found`);
        }

        if (trimmedText || add) {
          // Create new node with modified text
          const originalText = nodes[nodeId].text;
          
          // Validate trimmedText is a valid prefix
          if (trimmedText && !originalText.startsWith(trimmedText)) {
            // Find the first difference to highlight in the error message
            let i = 0;
            while (i < trimmedText.length && i < originalText.length && trimmedText[i] === originalText[i]) i++;
            const trimmedDiff = `${trimmedText.slice(Math.max(0, i-20), i)}[${trimmedText[i]}]${trimmedText.slice(i+1, i+20)}`;
            const originalDiff = `${originalText.slice(Math.max(0, i-20), i)}[${originalText[i]}]${originalText.slice(i+1, i+20)}`;
            throw new Error(`Trimmed text must be a prefix of the original text. First difference at position ${i}:\nTrimmed: ${trimmedDiff}\nOriginal: ${originalDiff}`);
          }

          let newText = trimmedText ? trimmedText : originalText;
          if (add) {
            if (add.length > 10) {
              throw new Error("Added text cannot exceed 10 characters");
            }
            newText += add;
          }

          const newId = Math.random().toString(36).substring(7);
          nodes[newId] = {
            text: newText,
            parentId: nodes[nodeId].parentId
          };
          currentNodeId = newId;

          response = {
            content: [{
              type: "text",
              text: `Created new node ${newId} with modified text and selected it`
            }]
          };
        } else {
          // Simple selection without modifications
          currentNodeId = nodeId;
          response = {
            content: [{
              type: "text",
              text: `Selected node ${nodeId}`
            }]
          };
        }
        break;
      }

      case "loom_show_path": {
        if (!currentNodeId) {
          throw new Error("No current node selected");
        }

        const textPieces = [];
        let nodeId: string | null = currentNodeId;
        
        while (nodeId !== null) {
          const node: Node = nodes[nodeId];
          textPieces.unshift(node.text);
          nodeId = node.parentId;
        }

        response = {
          content: [{
            type: "text",
            text: `${textPieces.join(" ")}`
          }]
        };
        break;
      }

      case "loom_set_conversation": {
        // Generate random ID if none provided
        const newConversationId = (request.params.arguments?.conversationId as string) || 
          Math.random().toString(36).substring(2, 10);

        try {
          // Try to load tree for conversation if ID was provided
          if (request.params.arguments?.conversationId) {
            const saveName = `conversation_${newConversationId}`;
            try {
              const loadPath = path.join(SAVES_DIR, `${saveName}.json`);
              const saveData = JSON.parse(
                await fs.readFile(loadPath, 'utf-8')
              ) as SavedTree;

              Object.keys(nodes).forEach(key => delete nodes[key]);
              Object.assign(nodes, saveData.nodes);
              currentNodeId = saveData.currentNodeId;
            } catch {
              throw new Error(`No saved conversation found with ID: ${newConversationId}`);
            }
          } else {
            // New conversation - just clear the tree
            Object.keys(nodes).forEach(key => delete nodes[key]);
            currentNodeId = null;
          }

          state.conversationId = newConversationId;

          response = {
            content: [{
              type: "text",
              text: `${request.params.arguments?.conversationId ? 'Loaded' : 'Created new'} conversation: ${newConversationId}`
            }]
          };
        } catch (error: unknown) {
          if (error instanceof Error) {
            throw new Error(`Failed to switch conversation: ${error.message}`);
          }
          throw new Error("Failed to switch conversation: Unknown error");
        }
        break;
      }

      default:
        throw new Error("Unknown tool");
    }
    
    // Don't autosave after set_conversation
    if (request.params.name !== "loom_set_conversation") {
      await autosaveCurrentTree();
    }
    
    return response;
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error}`
      }]
    };
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    await fs.mkdir(SAVES_DIR, { recursive: true });
    const files = await fs.readdir(SAVES_DIR);
    const saves = files.filter(f => f.endsWith('.json'));
    
    return {
      resources: saves.map(filename => ({
        uri: `loom-save:///${filename.slice(0, -5)}`,
        mimeType: "application/json",
        name: filename.slice(0, -5),
        description: `Saved loom tree: ${filename.slice(0, -5)}`
      }))
    };
  } catch (error) {
    return { resources: [] };
  }
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const url = new URL(request.params.uri);
  const name = url.pathname.replace(/^\//, '');
  
  try {
    const content = await fs.readFile(
      path.join(SAVES_DIR, `${name}.json`),
      'utf-8'
    );

    return {
      contents: [{
        uri: request.params.uri,
        mimeType: "application/json",
        text: content
      }]
    };
  } catch (error) {
    throw new Error(`Save "${name}" not found`);
  }
});

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  anthropicClient = new Anthropic({
    apiKey,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
