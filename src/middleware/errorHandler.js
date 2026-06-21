function notFoundHandler(req, res) {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found.' });
  }
  res.status(404).render('404', { title: 'Page not found' });
}

function errorHandler(err, req, res, next) {
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err.message);
  if (process.env.NODE_ENV !== 'production') console.error(err.stack);

  const status = err.status || 500;
  const message = status === 500 ? 'Something went wrong on our end. Please try again.' : err.message;

  if (req.originalUrl.startsWith('/api/')) {
    return res.status(status).json({ error: message });
  }
  res.status(status).render('error', { title: 'Error', message, status });
}

module.exports = { notFoundHandler, errorHandler };
