import { GitLog } from "./mod.tsx"

const { SMALLWEB_DIR } = Deno.env.toObject()

const gitlog = new GitLog({
    root: SMALLWEB_DIR
})

export default gitlog
