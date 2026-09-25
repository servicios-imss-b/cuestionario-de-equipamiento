import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext.tsx';
import { AlertTriangle, X } from 'lucide-react';

export const ZeroOfficesModal: React.FC = () => {
  const { isZeroOfficesModalOpen, setIsZeroOfficesModalOpen, handleConfirmZeroOffices } = useApp();
  const [isConfirmed, setIsConfirmed] = useState(false);

  useEffect(() => {
    if (!isZeroOfficesModalOpen) setIsConfirmed(false);
  }, [isZeroOfficesModalOpen]);

  if (!isZeroOfficesModalOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 15 }}
          className="relative max-w-md w-full rounded-3xl p-6 sm:p-7 backdrop-blur-2xl bg-[#611232]/95 border border-[#9B2247] shadow-2xl text-white text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 mx-auto flex items-center justify-center mb-3 text-amber-300">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <h3 className="text-lg font-bold text-white mb-2">
            Confirmación de 0 Consultorios
          </h3>

          <div className="mb-5 rounded-xl border border-rose-300/40 bg-black/20 p-3 text-left text-xs leading-relaxed text-rose-100/90 sm:text-sm">
            <p>Al cambiar a 0 consultorios se borrarán las respuestas de los consultorios y sus horarios.</p>
            <p className="mt-2 font-bold text-amber-200">Las 7 preguntas de equipamiento de unidad se conservarán.</p>
            <p className="mt-2 font-extrabold uppercase text-rose-200">Esta acción no se puede deshacer.</p>
          </div>

          <label className="mb-5 flex cursor-pointer items-start gap-2 text-left text-xs font-semibold text-white">
            <input
              type="checkbox"
              checked={isConfirmed}
              onChange={(event) => setIsConfirmed(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#A57F2C]"
            />
            <span>Estoy de acuerdo y autorizo borrar los datos de los consultorios.</span>
          </label>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsZeroOfficesModalOpen(false)}
              className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors"
            >
              CANCELAR
            </button>
            <button
              type="button"
              onClick={handleConfirmZeroOffices}
              disabled={!isConfirmed}
              className="flex-1 rounded-xl bg-[#A57F2C] py-2.5 text-xs font-bold text-black shadow-md transition-colors hover:bg-[#b88f33] disabled:cursor-not-allowed disabled:opacity-40"
              id="btn-confirmar-cero-consultorios"
            >
              ELIMINAR RESPUESTAS
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
