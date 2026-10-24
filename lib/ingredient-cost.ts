export function hasPackageCost(ingredient?:Record<string,any>){return !!ingredient&&Number.isFinite(ingredient.packagePrice)&&ingredient.packagePrice>=0&&Number.isFinite(ingredient.packageQuantity)&&ingredient.packageQuantity>0;}
// Keep full unit precision; round only the complete HPP of one serving.
export function ingredientUnitCost(ingredient?:Record<string,any>):number{
 if(hasPackageCost(ingredient))return ingredient!.packagePrice/ingredient!.packageQuantity;
 return ingredient&&Number.isFinite(ingredient.unitCost)&&ingredient.unitCost>=0?ingredient.unitCost:0;
}
export const preciseMoney=(value:number)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0,maximumFractionDigits:4}).format(value||0);
export const ingredientQuantity=(value:number)=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:4}).format(value||0);
