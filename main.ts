import { GitLog } from "./mod.tsx"
import * as path from "@std/path"

const { SMALLWEB_DIR } = Deno.env.toObject()

const gitlog = new GitLog({
    root: path.join(SMALLWEB_DIR, ".smallweb", "repos")
})

export default gitlog
