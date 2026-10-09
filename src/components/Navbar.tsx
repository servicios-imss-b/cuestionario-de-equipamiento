import React, { useRef, useState, type FormEvent } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { WifiOff, RefreshCw, Building2, Home, Lock, KeyRound, X } from 'lucide-react';
import { FillingInstructionsCabinet } from './FillingInstructionsCabinet.tsx';

interface NavbarProps {
  onSecretAccess: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onSecretAccess }) => {
  const logoClickCount = useRef(0);
  const logoClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const {
    activeSection,
    setActiveSection,
    isOnline,
    isSyncing,
    pendingSyncCount,
    triggerManualSync,
    selectedUnit,
    isCompletedUnitLocked,
    unlockCompletedUnit,
    addToast,
    handleUnlockUnit,
  } = useApp();

  const handleLogoClick = () => {
    if (isUnlockModalOpen) return;

    if (isCompletedUnitLocked) {
      logoClickCount.current += 1;
      if (logoClickTimer.current) clearTimeout(logoClickTimer.current);
      if (logoClickCount.current === 5) {
        logoClickCount.current = 0;
        setUnlockPassword('');
        setUnlockError('');
        setIsUnlockModalOpen(true);
        return;
      }
      logoClickTimer.current = setTimeout(() => {
        logoClickCount.current = 0;
      }, 1800);
      return;
    }

    if (activeSection !== 'inicio') {
      logoClickCount.current = 0;
      if (logoClickTimer.current) clearTimeout(logoClickTimer.current);
      return;
    }

    logoClickCount.current += 1;
    if (logoClickTimer.current) clearTimeout(logoClickTimer.current);

    if (logoClickCount.current === 4) {
      logoClickCount.current = 0;
      onSecretAccess();
      return;
    }

    logoClickTimer.current = setTimeout(() => {
      logoClickCount.current = 0;
    }, 1800);
  };

  const handleUnlockSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (unlockPassword !== '3180') {
      setUnlockError('La contraseña no es correcta.');
      return;
    }
    unlockCompletedUnit();
    setIsUnlockModalOpen(false);
    setUnlockPassword('');
    setUnlockError('');
    addToast('Unidad desbloqueada', 'success', 'Las preguntas vuelven a estar disponibles.');
  };

  const closeUnlockModal = () => {
    setIsUnlockModalOpen(false);
    setUnlockPassword('');
    setUnlockError('');
  };

  return (
    <header className="sticky top-0 z-40 bg-transparent text-white transition-all duration-300">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
        {/* Left: Home Button and Clean Typography */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveSection('inicio')}
            className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 hover:border-[#A57F2C] text-white hover:text-[#A57F2C] transition-all flex items-center justify-center backdrop-blur-md shadow-sm cursor-pointer"
            title="Ir al Inicio"
            aria-label="Ir a Inicio"
            id="btn-nav-home"
          >
            <Home className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <button
            type="button"
            onClick={handleLogoClick}
            className="cursor-default select-none"
            aria-label="IMSS Bienestar"
          >
            <img
              src="https://imssbienestar.gob.mx/assets/img/imb_b.svg"
              alt="IMSS Bienestar"
              className="h-8 sm:h-10 w-auto"
              draggable={false}
            />
          </button>

          {selectedUnit && activeSection === 'formulario' && <FillingInstructionsCabinet />}
        </div>

        {/* Right: Connection & Status Indicators */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Active Unit Badge if inside questionnaire */}
          {selectedUnit && activeSection === 'formulario' && (
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="hidden min-w-0 items-center gap-1.5 rounded-full border border-[#9B2247]/50 bg-[#611232]/70 px-3 py-1 text-xs backdrop-blur-md sm:flex">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-[#A57F2C]" />
                <span className="shrink-0 font-mono font-semibold text-amber-200">{selectedUnit.clues}</span>
                <span className="max-w-[140px] truncate text-[11px] text-zinc-200">{selectedUnit.name}</span>
              </div>
              <button
                type="button"
                onClick={handleUnlockUnit}
                className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-[#9B2247] bg-[#611232]/90 px-2 text-[9px] font-bold text-white hover:bg-[#7b173f]"
                title="Cambiar de unidad médica"
              >
                <Lock className="h-3.5 w-3.5 text-amber-300" />
                <span className="hidden md:inline">CAMBIAR UNIDAD</span>
              </button>
            </div>
          )}

          {/* Connection Status Indicator */}
          <div className="flex items-center gap-1.5">
            {isSyncing ? (
              <div 
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 backdrop-blur-md animate-pulse"
                title="Sincronizando cambios pendientes con la nube"
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span className="hidden sm:inline font-semibold">↻ SINCRONIZANDO</span>
              </div>
            ) : isOnline ? (
              <button
                onClick={triggerManualSync}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 backdrop-blur-md transition-colors cursor-pointer"
                title={pendingSyncCount > 0 ? `${pendingSyncCount} pendientes. Clic para sincronizar` : 'Servidor en línea'}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                <span className="font-semibold">● CONECTADO</span>
                {pendingSyncCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-black font-bold text-[10px]">
                    {pendingSyncCount}
                  </span>
                )}
              </button>
            ) : (
              <button
                onClick={triggerManualSync}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 backdrop-blur-md transition-colors cursor-pointer"
                title="Sin conexión. Clic para reintentar sincronizar"
              >
                <WifiOff className="w-3.5 h-3.5" />
                <span className="font-semibold">● SIN CONEXIÓN</span>
                {pendingSyncCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-black font-bold text-[10px]">
                    {pendingSyncCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
      {isUnlockModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="completed-unit-unlock-title">
          <form onSubmit={handleUnlockSubmit} className="relative w-full max-w-sm rounded-xl border border-amber-300/40 bg-[#002F2A] p-6 text-white shadow-2xl">
            <button type="button" onClick={closeUnlockModal} className="absolute right-3 top-3 rounded p-1 text-zinc-300 hover:bg-white/10 hover:text-white" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
            <div className="mb-5 flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-amber-300" />
              <div>
                <h2 id="completed-unit-unlock-title" className="text-sm font-bold">Desbloquear unidad completa</h2>
                <p className="mt-1 text-xs text-zinc-300">{selectedUnit?.clues}</p>
              </div>
            </div>
            <label htmlFor="completed-unit-password" className="mb-1.5 block text-xs font-semibold text-zinc-200">Contraseña</label>
            <input
              id="completed-unit-password"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              autoFocus
              value={unlockPassword}
              onChange={(event) => setUnlockPassword(event.target.value)}
              className="w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-400/30"
            />
            {unlockError && <p className="mt-2 text-xs text-rose-300" role="alert">{unlockError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeUnlockModal} className="rounded-md border border-white/20 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/10">Cancelar</button>
              <button type="submit" className="rounded-md bg-[#A57F2C] px-3 py-2 text-xs font-bold text-black hover:bg-[#b88f33]">Desbloquear</button>
            </div>
          </form>
        </div>
      )}
    </header>
  );
};
