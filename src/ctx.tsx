import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadData, saveData, type AppData } from './lib/storage';
import { checkModel, clearCrashFlag, crashedLastTime, modelInfo, onModel, type ModelInfo } from './lib/recognizer';
import { loadDictionary } from './lib/g2p';

interface Ctx {
  data: AppData;
  update: (fn: (d: AppData) => AppData) => void;
  model: ModelInfo;
  dictReady: boolean;
  crashed: boolean; // 前回、AIの処理中にページが落ちた
  dismissCrash: () => void;
  saveError: string | null;
  toast: (msg: string) => void;
}

const C = createContext<Ctx>(null as any);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData());
  const [model, setModel] = useState<ModelInfo>(modelInfo());
  const [dictReady, setDictReady] = useState(false);
  const [crashed, setCrashed] = useState(() => {
    const c = crashedLastTime();
    clearCrashFlag();
    return c;
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timer = useRef<number>();

  useEffect(() => setSaveError(saveData(data)), [data]);
  useEffect(() => {
    const off = onModel(setModel);
    checkModel(data.settings);
    loadDictionary().then(() => setDictReady(true));
    return () => {
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToastMsg(null), 3200);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ data, update: (fn) => setData((d) => fn(structuredClone(d))), model, dictReady, crashed, dismissCrash: () => setCrashed(false), saveError, toast }),
    [data, model, dictReady, crashed, saveError, toast],
  );
  return (
    <C.Provider value={value}>
      {children}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </C.Provider>
  );
}
