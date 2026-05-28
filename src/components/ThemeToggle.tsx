/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sun, Moon } from 'lucide-react';

interface ThemeToggleProps {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

export default function ThemeToggle({ theme, toggleTheme }: ThemeToggleProps) {
  return (
    <button
      id="theme-toggle"
      onClick={toggleTheme}
      className="p-2.5 rounded-xl transition-all duration-300 border focus:outline-none flex items-center justify-center gap-2 touch-target
        dark:bg-zinc-900/60 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/80
        bg-white border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <>
          <Sun id="icon-sun" className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-medium pr-1 hidden sm:inline">Light Mode</span>
        </>
      ) : (
        <>
          <Moon id="icon-moon" className="w-4 h-4 text-slate-700" />
          <span className="text-xs font-medium pr-1 hidden sm:inline">Dark Mode</span>
        </>
      )}
    </button>
  );
}
