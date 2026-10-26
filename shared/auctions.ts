import {TILES} from './catalog';
import {money,propertyValue} from './finance';
import type {GameState,Property} from './types';

export const LAND_AUCTION_RATE=.70;
export const landAuctionStartPrice=(tileId:number)=>money(TILES[tileId].price*LAND_AUCTION_RATE);
export const auctionStartPrice=(state:GameState,property:Property,foreclosure=false)=>foreclosure?money(propertyValue(state,property)*.5):landAuctionStartPrice(property.tileId);
