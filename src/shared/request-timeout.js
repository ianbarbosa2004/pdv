export const fetchWithTimeout = (request, timeoutMs = 30000) => {
  const controller = new AbortController();
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("Tempo limite da requisição excedido."));
    }, timeoutMs);
  });
  return Promise.race([
    Promise.resolve().then(() => request(controller.signal)),
    timeoutPromise
  ])
    .catch((error) => {
      if (error?.name === "AbortError") {
        throw new Error("Tempo limite da requisição excedido.");
      }
      throw error;
    })
    .finally(() => clearTimeout(timeout));
};
