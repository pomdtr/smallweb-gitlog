import * as path from "@std/path"
import colors from "ansi-colors"
import { Hono } from 'hono'
import * as git from "isomorphic-git"
import fs from "node:fs/promises"
import process from "node:process"

export type GitLogOptions = {
    root: string
}

interface GitCommit {
    author: {
        name: string
        email: string
        timestamp: number
    }
    message: string
}

interface GitLogEntry {
    commit: GitCommit
    oid: string
}

export class GitLog {
    private server

    constructor(private opts: GitLogOptions) {
        this.server = new Hono()
            .get("/", (c) => {
                return c.html(this.getTerminalHTML())
            })
            .get("/api/:repo", async (c) => {
                const dir = path.join(this.opts.root, c.req.param("repo"))
                try {
                    const commits = await git.log({ dir, fs })
                    const oneline = c.req.query("oneline") !== undefined
                    const formatted = this.formatGitLog(commits, oneline)
                    return c.text(formatted)
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
                    return c.text(colors.red(`Error: ${errorMessage}`), 404)
                }
            })
            .get("/:repo", (c) => {
                const repo = c.req.param("repo")
                return c.html(this.getTerminalHTML(repo))
            })
            .onError((err, c) => {
                console.error('Error occurred:', err)

                // Set appropriate status code and response
                return c.json({
                    success: false,
                    message: err.message || 'Internal Server Error',
                    status: 500
                }, 500)
            })
    }

    private formatGitLog(commits: GitLogEntry[], oneline: boolean): string {
        if (oneline) {
            return commits.map(({ commit, oid }) => {
                // Show short SHA and first line of commit message with colors
                const shortSha = colors.yellow(oid.slice(0, 7))
                const message = colors.white(commit.message.split("\n")[0])
                return `${shortSha} ${message}`
            }).join("\n")
        } else {
            return commits.map(({ commit, oid }) => {
                // Format date similar to git log output
                const date = new Date(commit.author.timestamp * 1000)
                const formattedDate = date.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    year: 'numeric',
                    timeZoneName: 'short'
                })

                return [
                    colors.yellow(`commit ${oid}`),
                    `Author: ${colors.cyan(commit.author.name)} <${colors.cyan(commit.author.email)}>`,
                    `Date:   ${colors.green(formattedDate)}`,
                    "",
                    `    ${colors.white(commit.message.trim())}`,
                    ""
                ].join("\n")
            }).join("\n")
        }
    }

    private getTerminalHTML(repo?: string): string {
        const title = repo ? `Git Log - ${repo}` : 'Git Log'

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css" />
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #000;
            font-family: "SF Mono", "Monaco", "Inconsolata", "Fira Code", "Fira Mono", "Roboto Mono", "DejaVu Sans Mono", "Lucida Console", monospace;
            height: 100vh;
            overflow: hidden;
        }
        #terminal {
            height: 100vh;
            width: 100vw;
            background: #000;
        }
    </style>
</head>
<body>
    <div id="terminal"></div>

    <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>

    <script>
        let terminal;
        let fitAddon;
        let currentRepo = '${repo || ''}';

        function initTerminal() {
            terminal = new Terminal({
                theme: {
                    background: '#000000',
                    foreground: '#ffffff',
                    cursor: '#ffffff',
                    selection: '#444444'
                },
                fontSize: 13,
                fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Fira Code", "Fira Mono", "Roboto Mono", "DejaVu Sans Mono", "Lucida Console", monospace',
                cursorBlink: true,
                allowTransparency: false,
                convertEol: true,
                disableStdin: true,
                cursorStyle: 'block'
            });

            fitAddon = new FitAddon.FitAddon();
            terminal.loadAddon(fitAddon);

            terminal.open(document.getElementById('terminal'));
            fitAddon.fit();

            window.addEventListener('resize', () => {
                fitAddon.fit();
            });
        }

        async function loadRepo(repo) {
            if (!repo) {
                terminal.writeln('\\x1b[31mError: No repository specified\\x1b[0m');
                return;
            }

            terminal.clear();
            terminal.writeln('\\x1b[36mLoading git log...\\x1b[0m');

            try {
                // Check for oneline query parameter in current URL
                const urlParams = new URLSearchParams(window.location.search);
                const isOneline = urlParams.has('oneline');
                const url = \`/api/\${repo}\${isOneline ? '?oneline' : ''}\`;

                const response = await fetch(url);
                const text = await response.text();

                terminal.clear();
                if (response.ok) {
                    // Split the response into lines and write each line separately to preserve formatting
                    const lines = text.split('\\n');
                    for (const line of lines) {
                        terminal.writeln(line);
                    }
                } else {
                    terminal.writeln(text);
                }
            } catch (error) {
                terminal.clear();
                terminal.writeln(\`\\x1b[31mError: \${error.message}\\x1b[0m\`);
            }
        }

        // Initialize terminal when page loads
        initTerminal();

        // Load repository if specified
        if (currentRepo) {
            loadRepo(currentRepo);
        } else {
            terminal.writeln('\\x1b[33mWelcome to Git Log Viewer\\x1b[0m');
            terminal.writeln('\\x1b[37mVisit /<repo-name> to view a repository\\'s git log\\x1b[0m');
            terminal.writeln('\\x1b[37mAdd ?oneline for compact format: /<repo-name>?oneline\\x1b[0m');
        }
    </script>
</body>
</html>`;
    }

    fetch = (req: Request) => {
        return this.server.fetch(req)
    }

    run = async (args: string[]) => {
        if (args.length === 0) {
            console.error("No repository specified. Usage: mod.ts <repo-name> [--oneline]");
            process.exit(1);
        }

        const repo = args[0]
        const oneline = args.includes("--oneline")
        
        try {
            const dir = path.join(this.opts.root, repo)
            const commits = await git.log({ dir, fs })
            const formatted = this.formatGitLog(commits as GitLogEntry[], oneline)
            console.log(formatted)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            console.error(colors.red(`Error: ${errorMessage}`))
            process.exit(1)
        }
    }
}
