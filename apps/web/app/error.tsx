"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="access">
      <p className="eyebrow">TFL STUDIO / CONEXIÓN</p>
      <h1>Core no está disponible</h1>
      <p>No se pudo verificar tu acceso. Tus datos no se han modificado.</p>
      <button onClick={reset}>Reintentar</button>
      <a href="/login">Ir al acceso</a>
    </main>
  );
}
