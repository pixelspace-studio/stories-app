/**
 * Telemetry Configuration Template
 * 
 * This file is a template for telemetry configuration.
 * To use telemetry with your own backend:
 * 
 * 1. Copy this file to: telemetry.config.js
 * 2. Update the apiUrl with your analytics backend URL
 * 3. Build with: npm run make:internal
 * 
 * The telemetry.config.js file is gitignored to keep your server URL private.
 */

module.exports = {
  /**
   * Analytics API endpoint
   * This is where telemetry events will be sent
   * 
   * Examples:
   * - Render.com: 'https://your-app.onrender.com'
   * - Heroku: 'https://your-app.herokuapp.com'
   * - Railway: 'https://your-app.railway.app'
   * - Custom server: 'https://analytics.yourdomain.com'
   */
  apiUrl: 'https://your-analytics-backend.com',
  
  /**
   * Enable debug mode
   * Set to true to see telemetry logs in console
   */
  debug: false
};

