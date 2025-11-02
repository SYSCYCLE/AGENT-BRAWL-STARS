const express = require('express');
const fetch = require('node-fetch');
const redis = require('redis');
const Pushbullet = require('pushbullet');

const PORT = process.env.PORT || 10000;
const PLAYER_TAG = process.env.PLAYER_TAG;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

const brawlStarsApiKey = process.env.BRAWL_STARS_API_KEY;
const pushbulletApiKey = process.env.PUSHBULLET_API_KEY;
const redisUrl = process.env.REDIS_URL;

if (!brawlStarsApiKey || !pushbulletApiKey || !redisUrl || !PLAYER_TAG) {
  console.error('Gerekli ortam değişkenleri ayarlanmamış! (BRAWL_STARS_API_KEY, PUSHBULLET_API_KEY, REDIS_URL, PLAYER_TAG)');
  process.exit(1);
}

const app = express();
const pusher = new Pushbullet(pushbulletApiKey);
const redisClient = redis.createClient({ url: redisUrl });

const normalizedTagForKey = PLAYER_TAG.replace(/#/g, '');
const LAST_XP_KEY = `player:${normalizedTagForKey}:lastXP`;

const checkPlayerXP = async () => {
  console.log(`${new Date().toISOString()} - Oyuncu verileri kontrol ediliyor...`);
  
  try {
    const encodedTag = encodeURIComponent(PLAYER_TAG);
    const response = await fetch(`https://api.brawlstars.com/v1/players/${encodedTag}`, {
      headers: { 'Authorization': `Bearer ${brawlStarsApiKey}` }
    });

    if (!response.ok) {
      console.error(`API Hatası: ${response.status} - ${response.statusText}`);
      if (response.status === 403) {
        console.error("IP adresi reddedildi! Render'ın şu anki IP'si Brawl Stars listesinde olmayabilir.");
      }
      return;
    }

    const playerData = await response.json();
    const currentXP = playerData.expPoints;

    const lastXPString = await redisClient.get(LAST_XP_KEY);
    const lastXP = lastXPString ? parseInt(lastXPString, 10) : 0;

    console.log(`Güncel XP: ${currentXP}, Son bilinen XP: ${lastXP}`);

    if (currentXP > lastXP) {
      const xpGain = currentXP - lastXP;
      console.log(`!!! XP ARTIŞI TESPİT EDİLDİ: +${xpGain} XP !!!`);
      
      await pusher.note({}, `${playerData.name} XP Kazandı!`, `Tebrikler! +${xpGain} XP kazandın.\nYeni XP: ${currentXP}`);
      
      await redisClient.set(LAST_XP_KEY, currentXP.toString());
      console.log('Yeni XP değeri veritabanına kaydedildi.');
    }

  } catch (error) {
    console.error('İzleme fonksiyonunda beklenmedik bir hata oluştu:', error);
  }
};

const startServer = async () => {
  try {
    await redisClient.connect();
    console.log('Redis veritabanına başarıyla bağlanıldı.');
  } catch (err) {
    console.error('Redis bağlantısı kurulamadı!', err);
    process.exit(1);
  }

  app.get('/', (req, res) => {
    res.send('Brawl Stars XP Monitörü aktif ve çalışıyor.');
  });

  app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda dinlemeye başladı.`);
    
    checkPlayerXP(); 
    
    setInterval(checkPlayerXP, CHECK_INTERVAL_MS);
  });
};

startServer();
