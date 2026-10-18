import { ShieldCheck, ArrowUpRight, Boxes } from "lucide-react";
export default function Login() {
  return (
    <main className="login">
      <div className="login-art">
        <span className="brand">
          <Boxes /> TFL STUDIO
        </span>
        <div>
          <p className="eyebrow">EL ESPACIO DETRÁS DE TODO</p>
          <h1>
            Ideas claras.
            <br />
            Equipo conectado.
          </h1>
          <p>Un lugar para coordinar lo que estamos construyendo.</p>
        </div>
        <span className="muted">TFL NETWORK · OPERACIONES INTERNAS</span>
      </div>
      <section className="login-form">
        <ShieldCheck size={34} />
        <p className="eyebrow">ACCESO PRIVADO</p>
        <h2>Bienvenido a Studio.</h2>
        <p>
          Continúa con tu cuenta de Discord. Tu acceso depende de los roles
          vigentes del equipo.
        </p>
        <a className="primary" href="/api/v1/auth/login">
          Continuar con Discord <ArrowUpRight size={18} />
        </a>
        <small>
          La incorporación al equipo requiere aprobación humana en Discord.
        </small>
      </section>
    </main>
  );
}
