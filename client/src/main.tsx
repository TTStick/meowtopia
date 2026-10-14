import { render } from 'preact';
import { App } from './ui/App';
import './style.css';
import { isNative } from './game/platform';
import { installTapRescue } from './game/tapfix';

render(<App />, document.getElementById('app')!);

if (!isNative && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// iOS app: make sure a tap on a button always clicks it (see tapfix.ts)
if (isNative) installTapRescue();
