# Prototype tactique 4x4 (GitHub Pages)

Petit jeu de stratégie **front-end only** (HTML/CSS/JavaScript vanilla), jouable sur une seule page.

## Lancer en local

Option simple :

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.

## Règles du prototype

- Deux grilles 4x4 alignées par colonnes : **IA en haut**, **joueur en bas**.
- Phase 1 : placement alterné des 4 pions de chaque camp (J1, IA1, J2, IA2, ...).
- Phase 2 : rounds avec initiative fixe (J1, IA1, J2, IA2, J3, IA3, J4, IA4).
- Début de round :
  - +1 jeton spécial,
  - application des bonus différés,
  - reset armure provisoire,
  - tous les gris vivants gagnent +1 armure.
- Chaque activation : déplacement optionnel d’1 case orthogonale sur sa grille, puis action :
  - attaque normale,
  - coup spécial (coûte 1 jeton),
  - ou passer.
- Conditions de victoire : détruire les 4 pions adverses.

### Couleurs

- **Gris** : 2 PV, tank/support, attaque normale = passer.
- **Rouge** : 1 PV, attaque normale = 2 dégâts au premier ennemi de sa colonne.
- **Bleu** : 1 PV, attaque normale = 1 dégât à tous les autres pions de sa colonne (alliés + ennemis).

### Spéciaux

- **Bleu** : +2 jetons au round suivant.
- **Rouge** : 2 impacts aléatoires de 1 dégât sur ennemis vivants.
- **Gris** : dégâts = nombre d’alliés vivants derrière lui dans la même colonne, vers le premier ennemi de colonne.
