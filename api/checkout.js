const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const PRICES = {
  audit: 'price_1UNXvyFL0f0XnUZCPR3HvaQK',
  mensuel: 'price_1UNXwYFL0f0XnUZCX1ZLbJTz'
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode refusée' });
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const plan = req.body && req.body.plan;
    if (!PRICES[plan]) return res.status(400).json({ error: 'Formule inconnue' });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Connexion requise' });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: plan === 'mensuel' ? 'subscription' : 'payment',
      line_items: [{ price: PRICES[plan], quantity: 1 }],
      client_reference_id: data.user.id,
      customer_email: data.user.email,
      metadata: { plan },
      success_url: process.env.SITE_URL + '/merci.html',
      cancel_url: process.env.SITE_URL + '/paiement.html?annule=1'
    });
    res.status(200).json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
