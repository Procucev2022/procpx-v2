declare module '*.open-next/worker.js' {
  const handler: {
    fetch: (request: Request) => Promise<Response> | Response;
  };

  export default handler;
}
