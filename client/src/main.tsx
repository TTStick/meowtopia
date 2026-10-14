import { render } from 'preact';
import { App } from './ui/App';
import './style.css';

render(<App />, document.getElementById('app')!);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
