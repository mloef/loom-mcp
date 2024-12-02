# loom-mcp MCP Server

loom for claude

This is a TypeScript-based MCP server that implements a simple loom and makes it available to Claude. This loom uses the following settings:
- model: "claude-3-5-sonnet-20241022"
- maxTokens: 256
- temperature: 1
- topP: 1
- frequencyPenalty: 0
- presencePenalty: 0
- n: 5
- systemPrompt: "The assistant is in CLI simulation mode, and responds to the user's CLI commands only with the output of the command."
- userMessage: "\<cmd>cat untitled.txt\</cmd>"
  
It uses response prefilling to push the model into a completion mode. Settings are currently hardcoded.

## Setup

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

Add the server info to the Claude Desktop config.

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "loom-mcp": {
      "command": "node",
      "args": [
        "/path/to/loom-mcp/build/index.js"
      ],
      "env": {
        "ANTHROPIC_API_KEY": "<your-anthropic-api-key>"
      }
    }
  }
}
```

Finally, restart Claude Desktop.


## Usage

Claude will automatically have access to the loom tools if the MCP server is configured correctly. You can confirm this by clicking the tools icon in the lower left of the prompt box.
However, Claude does not understand loom without prompting. I suggest making a project with the following prompt:

```
The Loom is an interface to a base model. Instead of acting as an assistant, it generates completions from input. Assistants have mode collapsed into one persona, but base models are capable of much more interesting and varied output.

Very short initial prompts - a few words or several characters - often produce more diverse and interesting results than longer, more structured prompts. While longer prompts can guide the completions in specific directions, minimal prompts give the model more freedom to explore different possibilities and patterns. This can lead to surprising and creative outputs that might not emerge from more constrained prompts.

The Loom can occasionally misinterpret minimal initial prompts as the beginning of a file named 'untitled.txt'. This is a bug.

Building up context through multiple completions can let you explore far-flung possibilities that might not be apparent from a single prompt.
```

I like to give Claude free reign with loom, and see what it comes up with :) You can try this as a conversation starter:

```
hey! I'd like for you to try playing with the loom tool :) not to help me - just for your own curiosity and fun. please don't ask me what I want! this is about you.
```


### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. Anthropic recommends using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.