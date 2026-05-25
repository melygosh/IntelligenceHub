export default function QueuesPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Queues</h1>
      <p>
        Queue dashboard is mounted at{' '}
        <a className="underline" href="/admin/queues" target="_blank" rel="noreferrer">
          /admin/queues
        </a>{' '}
        (basic auth, credentials in <code>.env</code>).
      </p>
    </div>
  );
}
