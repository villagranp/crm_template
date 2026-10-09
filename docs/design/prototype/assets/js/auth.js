/* ==========================================================================
   Mi Cliente AG — Autenticación: validación, mostrar/ocultar contraseña, envío
   ========================================================================== */
(function () {
  'use strict';

  const form = document.getElementById('loginForm');
  if (!form) return;

  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const emailError = document.getElementById('emailError');
  const passwordError = document.getElementById('passwordError');
  const submitBtn = document.getElementById('loginBtn');
  const toggleBtn = document.getElementById('togglePassword');

  /* Mostrar / ocultar contraseña */
  toggleBtn?.addEventListener('click', () => {
    const shown = password.type === 'text';
    password.type = shown ? 'password' : 'text';
    toggleBtn.setAttribute('aria-pressed', String(!shown));
    toggleBtn.setAttribute('aria-label', shown ? 'Mostrar contraseña' : 'Ocultar contraseña');
    toggleBtn.querySelector('.material-symbols-sharp').textContent = shown ? 'visibility' : 'visibility_off';
    password.focus({ preventScroll: true });
  });

  function setError(input, errorEl, show) {
    input.classList.toggle('is-invalid', show);
    input.setAttribute('aria-invalid', String(show));
    errorEl.hidden = !show;
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
  }

  // Valida al salir del campo, no mientras se escribe
  email.addEventListener('blur', () => setError(email, emailError, !validEmail(email.value)));
  password.addEventListener('blur', () => setError(password, passwordError, password.value.length < 8));
  email.addEventListener('input', () => { if (!emailError.hidden && validEmail(email.value)) setError(email, emailError, false); });
  password.addEventListener('input', () => { if (!passwordError.hidden && password.value.length >= 8) setError(password, passwordError, false); });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();

    const emailBad = !validEmail(email.value);
    const passBad = password.value.length < 8;
    setError(email, emailError, emailBad);
    setError(password, passwordError, passBad);

    if (emailBad || passBad) {
      (emailBad ? email : password).focus();
      window.toast?.('error', 'Revisa tus datos', 'Corrige los campos marcados para continuar.');
      return;
    }

    submitBtn.classList.add('is-loading');
    submitBtn.setAttribute('aria-busy', 'true');

    // Demo: sin backend. Sustituir por la llamada real de autenticación.
    setTimeout(() => {
      submitBtn.classList.remove('is-loading');
      submitBtn.removeAttribute('aria-busy');
      window.toast?.('success', 'Sesión iniciada', 'Redirigiendo al panel de control…');
      setTimeout(() => { window.location.href = '../../index.html'; }, 900);
    }, 1200);
  });
})();
