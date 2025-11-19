"use client";

import { useState } from "react";

import { TutorialBoard } from "@/components/learn/TutorialBoard";
import { TutorialMidfielderBoard } from "@/components/learn/TutorialMidfielderBoard";
import { TutorialForwardBoard } from "@/components/learn/TutorialForwardBoard";

const MODULES = [
  {
    id: "basics",
    title: "Conceptos básicos",
    summary: "Objetivo del juego y estructura del tablero.",
  },
  {
    id: "pieces",
    title: "Piezas y movimientos",
    summary: "Qué puede hacer cada tipo de pieza.",
  },
  {
    id: "goals",
    title: "Cómo se marca un gol",
    summary: "Porterías, reinicio del tablero y turnos.",
  },
];

export function LearnView() {
  const [activeModule, setActiveModule] = useState<string>("basics");

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      {/* Sidebar de módulos */}
      <aside className="w-full max-w-sm rounded-2xl border border-emerald-100 bg-white/80 p-4 shadow-md">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Modo Aprender a jugar
        </h2>
        <p className="mb-4 text-xs text-emerald-800/80">
          Recorre estos módulos para entender las reglas antes de jugar tus primeras partidas.
        </p>
        <div className="flex flex-col gap-2">
          {MODULES.map((module) => {
            const isActive = module.id === activeModule;
            return (
              <button
                key={module.id}
                type="button"
                onClick={() => setActiveModule(module.id)}
                className={`flex flex-col rounded-xl border px-3 py-2 text-left transition ${
                  isActive
                    ? "border-emerald-500 bg-emerald-50 shadow-sm"
                    : "border-emerald-100 bg-white hover:border-emerald-300 hover:bg-emerald-50/60"
                }`}
              >
                <span className="text-sm font-semibold text-emerald-900">
                  {module.title}
                </span>
                <span className="text-xs text-emerald-800/80">
                  {module.summary}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Contenido del módulo */}
      <section className="flex-1 rounded-2xl border border-sky-100 bg-white/90 p-5 sm:p-6 shadow-md">
        {activeModule === "basics" && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-emerald-950">
              🎯 Conceptos básicos
            </h2>
            <p className="text-sm text-emerald-900 leading-relaxed">
              Football Chess es un juego por turnos donde el objetivo es{" "}
              <span className="font-semibold">
                marcar más goles que tu oponente
              </span>{" "}
              moviendo piezas sobre un tablero de 12 filas por 8 columnas.
            </p>
            <ul className="list-disc space-y-2 pl-5 text-sm text-emerald-900">
              <li>
                Cada jugador tiene 12 piezas: defensas, carrileros,
                mediocampistas y delanteros.
              </li>
              <li>
                Las porterías están en las filas de cada jugador, en las dos
                columnas centrales.
              </li>
              <li>
                Ganas la partida cuando llegas al número de goles elegido al
                crear la partida (1, 2 o 3).
              </li>
            </ul>
            <div className="mt-4 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/70 p-4 text-xs text-emerald-900">
              <p className="font-semibold mb-1">Sugerencia</p>
              <p>
                Puedes practicar las reglas creando una partida contra la IA en
                modo fácil, sin preocuparte por el resultado.
              </p>
            </div>
          </div>
        )}

        {activeModule === "pieces" && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-emerald-950">
              ♟️ Piezas y movimientos
            </h2>
            <p className="text-sm text-emerald-900 leading-relaxed">
              Cada tipo de pieza tiene una forma de moverse, inspirada en piezas
              de ajedrez pero adaptadas al fútbol:
            </p>
            <ul className="space-y-3 text-sm text-emerald-900">
              <li>
                <span className="font-semibold">🛡️ Defensas</span>: 1 casilla
                en cualquier dirección (como el rey). Pueden marcar gol.
              </li>
              <li>
                <span className="font-semibold">👤 Carrileros</span>: 1 o 2
                casillas en línea recta horizontal o vertical.
              </li>
              <li>
                <span className="font-semibold">⚙️ Mediocampistas</span>:
                diagonales largas (como alfiles). Pueden marcar gol.
              </li>
              <li>
                <span className="font-semibold">⚡ Delanteros</span>: cualquier
                dirección y distancia (como la reina). Son tus piezas más
                peligrosas para atacar.
              </li>
            </ul>
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/80 p-4 text-xs text-sky-900">
              <p className="font-semibold mb-1">Tip práctico</p>
              <p>
                Durante las partidas, si tienes activada la ayuda en tu perfil,
                al dejar el ratón sobre una pieza unos segundos verás sus
                movimientos posibles resaltados en el tablero.
              </p>
            </div>

            {/* Primer ejercicio interactivo */}
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <h3 className="mb-2 text-sm font-semibold text-emerald-900">
                Ejercicio 1: mover una defensa
              </h3>
              <p className="text-xs text-emerald-900/90">
                En el tablero de ejemplo, selecciona una defensa (D) de tu última fila
                y muévela una casilla hacia adelante. Esto te ayuda a entender cómo
                se mueven las piezas más básicas del juego.
              </p>
              <TutorialBoard />
            </div>

            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <h3 className="mb-2 text-sm font-semibold text-emerald-900">
                Ejercicio 2: mediocampista en diagonal
              </h3>
              <p className="text-xs text-emerald-900/90">
                Ahora practica con un mediocampista (M). Selecciona el mediocampista
                resaltado y muévelo dos casillas en diagonal hacia el campo rival.
              </p>
              <TutorialMidfielderBoard />
            </div>

            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <h3 className="mb-2 text-sm font-semibold text-emerald-900">
                Ejercicio 3: avanzar con un delantero
              </h3>
              <p className="text-xs text-emerald-900/90">
                Finalmente, practica avanzar un delantero (F). Selecciona el delantero
                resaltado y muévelo hacia el arco rival, acercándolo a la zona de gol.
              </p>
              <TutorialForwardBoard />
            </div>
          </div>
        )}

        {activeModule === "goals" && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-emerald-950">
              ⚽ Cómo se marca un gol
            </h2>
            <p className="text-sm text-emerald-900 leading-relaxed">
              Un gol se marca cuando cualquier pieza termina su movimiento{" "}
              en una casilla de portería del oponente. Todas las piezas pueden marcar goles.
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-emerald-900">
              <li>
                Avanza tus piezas hacia la portería rival. No necesitas llegar de un solo movimiento;
                piensa la jugada como una jugada armada en varios toques.
              </li>
              <li>
                Controla las columnas centrales (D y E): son el camino directo
                hacia el arco y donde están las porterías.
              </li>
              <li>
                Los defensas pueden marcar goles, pero su movimiento limitado (1 casilla)
                los hace más útiles para proteger y recuperar la pelota.
              </li>
            </ol>
            <p className="text-sm text-emerald-900 leading-relaxed">
              Después de cada gol, el tablero se reinicia a la posición inicial
              y mueve primero el jugador que recibió el gol. Esto crea{" "}
              <span className="font-semibold">mini-partidos</span> dentro de la
              misma partida.
            </p>
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs text-emerald-900">
              <p className="mb-1 font-semibold">Consejo táctico</p>
              <p>
                Intenta combinar mediocampistas y delanteros: los mediocampistas
                te ayudan a llegar a la media cancha en diagonal, y los
                delanteros rematan las jugadas entrando en el arco rival.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}


