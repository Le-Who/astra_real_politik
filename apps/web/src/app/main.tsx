import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Startup } from './startup.js';
import './startup.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing');
createRoot(root).render(<StrictMode><Startup /></StrictMode>);
