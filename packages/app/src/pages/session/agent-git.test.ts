import { describe, expect, test } from "bun:test"
import { $ } from "bun"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { commitAndPush, commitOnly, pushOnly, readOutcome } from "./agent-git"

const sh = (cwd: string, command: string) => $`sh -c ${command}`.cwd(cwd).nothrow().quiet().text()

async function repo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sicode-git-"))
  const remote = path.join(root, "remote.git")
  const work = path.join(root, "work")
  await $`git init -q --bare ${remote}`.quiet()
  await $`git init -q -b main ${work}`.quiet()
  await $`git -C ${work} config user.email t@t`.quiet()
  await $`git -C ${work} config user.name t`.quiet()
  await fs.writeFile(path.join(work, "README.md"), "hi\n")
  await $`git -C ${work} add README.md`.quiet()
  await $`git -C ${work} commit -q -m init`.quiet()
  await $`git -C ${work} remote add origin ${remote}`.quiet()
  return { root, remote, work }
}

describe("commitAndPush", () => {
  test("commits the files and pushes the new branch to origin", async () => {
    const { root, remote, work } = await repo()
    await fs.writeFile(path.join(work, "it's.txt"), "x\n")
    const outcome = readOutcome(await sh(work, commitAndPush(["it's.txt"], "Add a file with a 'quote'")))
    expect([outcome.committed, outcome.pushed]).toEqual([true, true])
    expect((await $`git -C ${remote} log --format=%s -1 main`.text()).trim()).toBe("Add a file with a 'quote'")
    await fs.rm(root, { recursive: true, force: true })
  })

  test("a commit that fails pushes nothing", async () => {
    const { root, remote, work } = await repo()
    await $`git -C ${work} push -q -u origin main`.quiet()
    await fs.writeFile(path.join(work, "b.txt"), "b\n")
    await $`git -C ${work} add b.txt`.quiet()
    await $`git -C ${work} commit -q -m "Not pushed yet"`.quiet()
    const outcome = readOutcome(await sh(work, commitAndPush(["missing.txt"], "Nothing")))
    expect([outcome.committed, outcome.pushed]).toEqual([false, false])
    expect((await $`git -C ${remote} log --format=%s -1 main`.text()).trim()).toBe("init")
    await fs.rm(root, { recursive: true, force: true })
  })

  test("reports a commit that could not be pushed", async () => {
    const { root, work } = await repo()
    await $`git -C ${work} remote set-url origin ${path.join(root, "missing.git")}`.quiet()
    await fs.writeFile(path.join(work, "a.txt"), "a\n")
    const outcome = readOutcome(await sh(work, commitAndPush(["a.txt"], "Add a")))
    expect([outcome.committed, outcome.pushed]).toEqual([true, false])
    expect(outcome.log).toContain("missing.git")

    await $`git -C ${work} remote set-url origin ${path.join(root, "remote.git")}`.quiet()
    expect(readOutcome(await sh(work, pushOnly())).pushed).toBe(true)
    await fs.rm(root, { recursive: true, force: true })
  })
})

describe("commitOnly", () => {
  test("commits only the checked files, including a deletion, and leaves the rest uncommitted", async () => {
    const { root, remote, work } = await repo()
    await $`git -C ${work} push -q -u origin main`.quiet()
    await fs.rm(path.join(work, "README.md"))
    await fs.mkdir(path.join(work, "src"))
    await fs.writeFile(path.join(work, "src", "a*.ts"), "a\n")
    await fs.writeFile(path.join(work, "src", "ab.ts"), "b\n")
    await fs.writeFile(path.join(work, ".env"), "TOKEN=x\n")
    await $`git -C ${work} add .env`.quiet()
    // Run from a subfolder: the paths are relative to the repository root, as git status lists them.
    const outcome = readOutcome(await sh(path.join(work, "src"), commitOnly(["README.md", "src/a*.ts"], "Pick two")))
    expect([outcome.committed, outcome.pushed]).toEqual([true, false])
    expect((await $`git -C ${work} show --name-status --format= HEAD`.text()).trim().split("\n")).toEqual([
      "D\tREADME.md",
      "A\tsrc/a*.ts",
    ])
    const left = (await $`git -C ${work} status --porcelain=v1 --untracked-files=all`.text()).trim().split("\n")
    expect(left).toEqual(["A  .env", "?? src/ab.ts"])
    expect((await $`git -C ${remote} log --format=%s -1 main`.text()).trim()).toBe("init")
    await fs.rm(root, { recursive: true, force: true })
  })
})
