// Full-project reads activate backend context. Keep shell activations sequential.
let activationQueue = Promise.resolve();
export function activateSequentially(operation) {
    const next = activationQueue.then(operation, operation);
    activationQueue = next.catch(() => undefined);
    return next;
}
