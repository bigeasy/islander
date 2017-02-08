## Notes

Going to eventually remove play uniform. Currently, simply going to ingest
messages one a time using a `push`, run it though the current algorithm, but
push to a Procession outbox.

Ah, also want to create an `outbox` Procession to trigger republishing.

Look at the [Docco](./docco/) for now.
