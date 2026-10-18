import { render } from 'preact';
import { App } from './App';
import './styles.css';
import { applyTheme, getTheme } from './theme';

applyTheme(getTheme());

render(<App />, document.getElementById('app')!);
