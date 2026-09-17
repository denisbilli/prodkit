// A landing page that fades sections in as they scroll into view.
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  }
});
document.querySelectorAll('section').forEach((el) => observer.observe(el));
