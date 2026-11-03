import keytar from "keytar";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const service = args.get("--service");
const account = args.get("--account");
if (!service || !account) {
  throw new Error("Informe --service e --account.");
}

const removed = await keytar.deletePassword(service, account);
console.log(removed ? "Credencial do MariaDB removida." : "Credencial do MariaDB não encontrada.");
