import './styles.css';
import { App } from './app';

const root = document.getElementById('app');
if (!root) throw new Error('No se encontró el contenedor principal.');

new App(root).mount();
