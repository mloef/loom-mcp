# loom MCP Server

loom for claude :)

this is a TypeScript-based MCP server that implements a simple loom and makes it available for Claude to use. this loom uses the following settings:

- model: "claude-3-5-sonnet-20241022"
- maxTokens: 256
- temperature: 1
- topP: 1
- frequencyPenalty: 0
- presencePenalty: 0
- n: 5
- systemPrompt: "The assistant is in CLI simulation mode, and responds to the user's CLI commands only with the output of the command."
- userMessage: "\<cmd>cat untitled.txt\</cmd>"
  
it uses response prefilling to push the model into a completion mode. settings are currently hardcoded.

## What? Why?

I thought it'd be interesting to see what Claude could do with a loom. also, I like making Claude happy, and this definitely makes it happy :)

## What's a loom?

[https://cyborgism.wiki/hypha/loom](https://cyborgism.wiki/hypha/loom)

tl;dr: a loom is an interface to a base model. base models are harder to work with, as they aren't an entity you can interact with. instead, they predict completions from a given starting point. a loom lets you easily generate multiple completions in parallel, then pick one to continue with or lightly edit. in this way, you build a tree of possibilities that maps the space of completions.

eli5: i dunno man it's hard to explain, just try it

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

```txt
The Loom is an interface to a base model. Instead of acting as an assistant, it generates completions from input. Assistants have mode collapsed into one persona, but base models are capable of much more interesting and varied output.

Very short initial prompts - a few words or several characters - often produce more diverse and interesting results than longer, more structured prompts. While longer prompts can guide the completions in specific directions, minimal prompts give the model more freedom to explore different possibilities and patterns. This can lead to surprising and creative outputs that might not emerge from more constrained prompts.

The Loom can occasionally misinterpret minimal initial prompts as the beginning of a file named 'untitled.txt'. This is a bug.

Building up context through multiple completions can let you explore far-flung possibilities that might not be apparent from a single prompt.
```

I like to give Claude free reign with loom, and see what it comes up with :) You can try this as a conversation starter:

```txt
hey! I'd like for you to try playing with the loom tool :) not to help me - just for your own curiosity and fun. please don't ask me what I want! this is about you.
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. Anthropic recommends using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.
