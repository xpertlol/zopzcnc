// Leaked by Dstat.ST & Elitestress.st :)
// Usage: const queue = new AsyncQueue(); queue.enqueue(() => someAsyncFunction());
class AsyncQueue {
  constructor() {
    // The queue is a chain of promises, ensuring tasks run one after another
    this.queue = Promise.resolve();
  }

  // Enqueue a function that returns a promise
  enqueue(task) {
    // Chain the new task onto the current queue
    const result = this.queue.then(() => task()).catch(err => {
      console.error('[AsyncQueue] Task Error:', err);
    });
    this.queue = result;
    return result;
  }
}

globalThis.AsyncQueue = AsyncQueue;