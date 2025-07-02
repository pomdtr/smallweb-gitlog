import { Hono } from 'hono'
import * as git from "isomorphic-git"
import * as path from "@std/path"
import fs from "node:fs/promises"

export type GitLogOptions = {
    root: string
}

export class GitLog {
    private server

    constructor(private opts: GitLogOptions) {
        this.server = new Hono()
            .get("/", (c) => {
                const url = new URL(c.req.url)
                return c.text(`Usage: https://${url.host}/:repo`)
            })
            .get("/:repo", async (c) => {
                const gitdir = path.join(this.opts.root, c.req.param("repo"))
                const commits = await git.log({ gitdir, fs })
                const oneline = c.req.query("oneline") !== undefined
                let formatted
                if (oneline) {
                    formatted = commits.map(({ commit, oid }) => {
                        // Show short SHA and first line of commit message
                        return `${oid.slice(0, 7)} ${commit.message.split("\n")[0]}`
                    }).join("\n")
                } else {
                    formatted = commits.map(({ commit, oid }) => {
                        return [
                            `commit ${oid}`,
                            `Author: ${commit.author.name} <${commit.author.email}>`,
                            `Date:   ${new Date(commit.author.timestamp * 1000).toISOString()}`,
                            "",
                            `    ${commit.message.trim()}`,
                            ""
                        ].join("\n")
                    }).join("\n")
                }
                return c.text(formatted)
            })
    }

    fetch = (req: Request) => {
        return this.server.fetch(req)
    }
}
