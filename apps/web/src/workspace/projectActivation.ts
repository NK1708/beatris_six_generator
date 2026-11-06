// Full-project reads activate backend context. Keep shell activations sequential.
let activationQueue: Promise<unknown> = Promise.resolve();

export function activateSequentially<T>(operation: () => Promise<T>): Promise<T> {
  const next = activationQueue.then(operation, operation);
  activationQueue = next.catch(() => undefined);
  return next;
}
