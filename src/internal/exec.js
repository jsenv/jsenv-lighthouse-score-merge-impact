import { exec as nodeExec } from "child_process"

export const exec = (command, { onLog = () => {}, onErrorLog = () => {} } = {}) => {
  return new Promise((resolve, reject) => {
    const command = nodeExec(
      command,
      {
        stdio: "silent",
      },
      (error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      },
    )

    command.stdout.on("data", (data) => {
      onLog(data)
    })
    command.stderr.on("data", (data) => {
      // debug because this output is part of
      // the error message generated by a failing npm publish
      onErrorLog(data)
    })
  })
}
