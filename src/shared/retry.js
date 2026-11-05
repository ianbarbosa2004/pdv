export const runWithRetry = async (
  operation,
  { attempts = 3, delayMs = 250, sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)) } = {}
) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(delayMs * attempt);
      }
    }
  }
  throw lastError;
};
