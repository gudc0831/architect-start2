const [, , commandName = "command", suggestion = "Use the guarded replacement instead."] = process.argv;
console.error(`${commandName} is blocked by the data guard policy. ${suggestion}`);
process.exit(1);
