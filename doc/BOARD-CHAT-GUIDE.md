# Board Chat Guide

A step-by-step guide for managing your Paperclip company through Claude Code in the terminal.

## What is this?

Paperclip is a control plane for AI-agent companies. You create a company, hire AI agents, assign them tasks, and manage their work. Normally you'd do this through the web dashboard, but the **Board Chat** skill lets you do everything through a natural conversation with Claude in your terminal.

Think of it like texting an assistant who happens to have full access to your company's operations.

## Prerequisites

Before you start, you need two things:

1. **Paperclip running locally** — Ask your engineer to set this up. They'll run `pnpm dev` and tell you the URL (usually `http://localhost:3000`).

2. **Claude Code installed** — This is Anthropic's CLI tool. Install it by running:
   ```
   npm install -g @anthropic-ai/claude-code
   ```

## Setup (one time, ~2 minutes)

### Step 1: Install the board skill

Open your terminal and navigate to the Paperclip project folder:

```
cd ~/Projects/DEV/paperclip
```

Run the setup command:

```
pnpm paperclipai board setup
```

This does two things:
- Installs the board skill so Claude knows how to manage Paperclip
- Shows you which companies exist (if any)

### Step 2: Set your environment

The setup command prints one or two lines starting with `export`. Copy and paste them into your terminal:

```
export PAPERCLIP_API_URL='http://localhost:3000'
```

If you already have a company, it will also show:
```
export PAPERCLIP_COMPANY_ID='your-company-id-here'
```

Paste these lines and press Enter. They tell Claude where your Paperclip server is.

### Step 3: Launch Claude Code

```
claude --dangerously-skip-permissions
```

The `--dangerously-skip-permissions` flag lets Claude run commands without asking you to approve each one. This is safe because it's only talking to your local Paperclip server.

That's it. You're in. Start typing.

## Your first conversation

### Starting a new company

```
You: I want to start a new company called Megacorp. Our mission is to
     build the best widget marketplace on the internet.
```

Claude will create the company and guide you through setting up your first CEO agent.

### If you already have a company

```
You: What's happening today?
```

Claude will show you a dashboard: how many agents you have, open tasks, budget usage, and anything that needs your attention.

## Common things you can ask

### Company overview
- "What's the status of my company?"
- "Show me the dashboard"
- "How much have we spent this month?"

### Hiring agents
- "Help me build a hiring plan"
- "I need a frontend engineer and a content writer"
- "Show me the candidates' system prompts"
- "Approve all hires"

### Managing tasks
- "What tasks are open?"
- "What's the CEO working on?"
- "Create a task to build a landing page and assign it to the frontend engineer"

### Approvals
- "Are there any pending approvals?"
- "Approve the designer hire"
- "Reject the icon library request — too expensive"

### Costs
- "How are my costs today?"
- "Show me a breakdown by agent"

### Agent management
- "Show me all my agents"
- "What's the frontend engineer's system prompt?"
- "Change the designer's focus to include UX research"

## Tips

### Be natural
You don't need to use special commands or syntax. Just talk like you're chatting with a colleague. Claude understands context.

### Iterate on plans
When building a hiring plan or strategy, you can go back and forth:
```
You: Cut the SEO specialist. Add a designer instead.
You: Actually, make the designer focus on UX research too.
You: Looks good. Hire them all.
```

### Check the web UI
Everything Claude does through chat is also visible in the Paperclip web dashboard. Go to `http://localhost:3000` in your browser to see the spatial view of your company — org chart, task board, cost graphs.

### Session continuity
When you close the terminal and come back later, Claude won't remember your previous conversation. But it will read the decision log and check the dashboard, so it knows the current state of your company.

Start a new session the same way:
```
export PAPERCLIP_API_URL='http://localhost:3000'
export PAPERCLIP_COMPANY_ID='your-company-id'
claude --dangerously-skip-permissions
```

Then just say "What's happening?" and pick up where you left off.

### Editing across surfaces
You can edit things (like hiring plans or agent prompts) in three places:
1. **In chat** — describe the change and Claude makes it
2. **In a file** — Claude can create local `.md` files you can edit in any text editor
3. **In the web UI** — edit directly in the dashboard, then tell Claude "sync up"

## Troubleshooting

### "PAPERCLIP_API_URL is not set"
You forgot to run the `export` command. Paste it again:
```
export PAPERCLIP_API_URL='http://localhost:3000'
```

### Claude keeps asking for permission to run commands
You launched Claude without the permissions flag. Exit with Ctrl+C and relaunch:
```
claude --dangerously-skip-permissions
```

### Nothing happens / commands fail
The Paperclip server probably isn't running. Ask your engineer to start it with `pnpm dev`.

### Claude seems confused about my company
Start fresh by telling Claude your company ID:
```
You: My company ID is abc123-def456. Show me the dashboard.
```

## What's next

Once you're comfortable with the terminal experience, you can also try the **Board Chat** in the web UI — go to `http://localhost:3000` and click "Board Chat" in the sidebar. Same conversation, but inside the dashboard where you can see your agents and tasks alongside the chat.
