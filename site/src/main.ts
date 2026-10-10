import './style.css';

const app = document.querySelector<HTMLElement>('#app');
if (app) {
  app.innerHTML = `
    <h1>My Scarves</h1>
    <p>Football fan scarves from the 1st and 2nd divisions of the 55 UEFA associations.</p>
    <p class="muted">Work in progress.</p>
  `;
}
