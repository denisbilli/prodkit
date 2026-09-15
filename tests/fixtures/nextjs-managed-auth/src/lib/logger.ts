export const logger = {
  info: (message, fields = {}) =>
    process.stdout.write(JSON.stringify({ level: "info", message, ...fields }) + "\n")
};
