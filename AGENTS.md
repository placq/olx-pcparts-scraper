Hi, the goal for this project is to make simple CLI app with the sole pourpouse to scrap the one single category on OLX.pl with one querry flag - https://www.olx.pl/elektronika/komputery/podzespoly-i-czesci/?courier=1
This app should be written in JS with the usage of axios. the idea right now is to downloade whole html, identyfy auction title, price, url and pagionation buttons. Save to JSON title, url and price (without doubles), then proceed to the next page and to it all over again. There are 25 pages.

title, ulr and price are in <div data-cy="ad-card-title" data-testid="ad-card-title" class="css-u2ayx9">

title - <h4 data-nx-name="H4" data-nx-legacy="true" class="css-hzlye5">Pamięć RAM Yongxinsheng DDR4 32GB 2666MHz PC4-21300 UDIMM</h4>
url - <a class="css-1tqlkj0" href="/d/oferta/pamiec-ram-yongxinsheng-ddr4-32gb-2666mhz-pc4-21300-udimm-CID99-ID19Mry9.html?search_reason=search%7Corganic">
price - <p data-testid="ad-price" data-nx-name="P2" data-nx-legacy="true" class="css-blr5zl">flex

secon page url looks like this https://www.olx.pl/elektronika/komputery/podzespoly-i-czesci/?courier=1&page=2 so you can just change the page=2 number to 3, 4 and so on, there is no need to find pagination buttons. There are 25 pages, you can hardcode it.
the outcom should be a structured json with title, url and price
