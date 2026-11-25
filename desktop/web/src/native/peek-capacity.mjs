// Peek displays familiar MB/GB/TB labels; saved limits still use binary MiB.
const units=['MB','GB','TB','PB'];
export function formatPeekMiB(amount,{fractionDigits=4}={}){
 let value=amount,order=0;
 while(Math.abs(value)>=1024&&order<units.length-1){value/=1024;order++;}
 return `${Number(value.toFixed(fractionDigits))} ${units[order]}`;
}
