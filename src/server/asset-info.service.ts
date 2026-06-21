import Anthropic from '@anthropic-ai/sdk';
import { admin } from './firebase-admin.js';

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': '*/*, application/json',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
};

const fetchWithTimeout = async (url: string, options: any = {}, timeout = 6000): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
};

export interface AssetInfo {
  symbol: string;
  name: string;
  type: string;
  sector: string | null;
  description: string | null;
  logoUrl: string | null;
  exchange: string | null;
  currency: string | null;
  currentPrice: number | null;
  previousClose: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;
}

const infoCache = new Map<string, { data: AssetInfo; ts: number }>();
const INFO_CACHE_TTL = 5 * 60_000;

const descriptionCache = new Map<string, string>();

const STATIC_DESCRIPTIONS: Record<string, string> = {
  'BTC': 'Bitcoin es la primera criptomoneda descentralizada del mundo, creada en 2009 por una persona o grupo bajo el seudónimo de Satoshi Nakamoto. Su libro blanco, publicado en octubre de 2008, propuso un sistema de dinero electrónico entre pares que no requiere intermediarios financieros. Bitcoin opera sobre una red blockchain donde los mineros validan las transacciones mediante un mecanismo de consenso llamado prueba de trabajo, recibiendo recompensas en BTC por cada bloque procesado. Con un suministro máximo limitado a 21 millones de unidades, Bitcoin fue diseñado como un activo deflacionario que contrasta con las monedas fiduciarias tradicionales sujetas a políticas de expansión monetaria. A lo largo de los años, ha pasado de ser un experimento tecnológico a convertirse en un activo financiero reconocido a nivel global, adoptado tanto por inversores minoristas como institucionales. Empresas cotizadas en bolsa y fondos de inversión han incorporado Bitcoin a sus balances como reserva de valor, y diversos países han comenzado a regularlo o incluso adoptarlo como moneda de curso legal. Su volatilidad, aunque elevada, ha tendido a disminuir con la madurez del mercado y el aumento de la liquidez. Bitcoin es considerado por muchos como oro digital, una cobertura contra la inflación y la devaluación de las divisas. Su infraestructura ha evolucionado con soluciones de segunda capa como Lightning Network, que permite transacciones rápidas y de bajo coste, ampliando su utilidad como medio de pago cotidiano además de su función como reserva de valor a largo plazo.',

  'ETH': 'Ethereum es una plataforma de código abierto basada en tecnología blockchain que fue propuesta por Vitalik Buterin en 2013 y lanzada oficialmente en julio de 2015. A diferencia de Bitcoin, que se centra principalmente en las transferencias de valor, Ethereum introdujo el concepto de contratos inteligentes: programas autónomos que se ejecutan automáticamente cuando se cumplen condiciones predefinidas, sin necesidad de intermediarios. Su criptomoneda nativa, Ether (ETH), se utiliza tanto para pagar las comisiones de transacción dentro de la red como para participar en su mecanismo de consenso. En septiembre de 2022, Ethereum completó una transición histórica conocida como The Merge, migrando de un sistema de prueba de trabajo a uno de prueba de participación, lo que redujo su consumo energético en aproximadamente un 99%. Esta plataforma se ha convertido en el pilar fundamental del ecosistema de finanzas descentralizadas (DeFi), los tokens no fungibles (NFT) y las organizaciones autónomas descentralizadas (DAO). Miles de aplicaciones descentralizadas operan sobre Ethereum, gestionando miles de millones en valor. Su comunidad de desarrolladores es la más grande del sector blockchain, lo que garantiza una innovación continua. Ethereum ha implementado múltiples actualizaciones para mejorar su escalabilidad y reducir las comisiones, incluyendo soluciones de segunda capa como Arbitrum y Optimism. Para los inversores, ETH representa una exposición al crecimiento de toda la economía descentralizada, ya que la mayoría de los proyectos y protocolos DeFi dependen directa o indirectamente de la infraestructura de Ethereum.',

  'SOL': 'Solana es una blockchain de alto rendimiento fundada por Anatoly Yakovenko en 2017 y lanzada en marzo de 2020. Su principal innovación técnica es el mecanismo de prueba de historia (Proof of History), que funciona como un reloj criptográfico que ordena las transacciones antes de que sean procesadas por los validadores, permitiendo un rendimiento teórico de decenas de miles de transacciones por segundo con tiempos de finalización inferiores a un segundo. Esta velocidad y sus bajas comisiones, que suelen ser fracciones de céntimo, han convertido a Solana en una de las plataformas preferidas para aplicaciones que requieren alta frecuencia de transacciones, como mercados de NFT, plataformas de trading descentralizado y aplicaciones de pagos. Su criptomoneda nativa, SOL, se utiliza para pagar comisiones de red y para participar en el staking que asegura la red mediante prueba de participación. El ecosistema de Solana ha experimentado un crecimiento notable, atrayendo a cientos de proyectos DeFi, juegos blockchain y aplicaciones de consumo. Aunque la red ha enfrentado interrupciones temporales en sus primeros años, las sucesivas actualizaciones han mejorado significativamente su estabilidad y resiliencia. Solana Labs y la Fundación Solana lideran el desarrollo, respaldados por inversores como Andreessen Horowitz y Polychain Capital. Para los inversores, SOL ofrece exposición a una de las blockchains de capa uno con mayor adopción y actividad de desarrolladores, posicionándose como una alternativa competitiva a Ethereum con un enfoque en velocidad y coste reducido.',

  'KAS': 'Kaspa es una criptomoneda de capa uno lanzada en noviembre de 2021 que implementa el protocolo blockDAG (Directed Acyclic Graph), una evolución de la arquitectura blockchain tradicional. Fue concebida por Yonatan Sompolinsky, investigador de la Universidad Hebrea de Jerusalén y coautor del protocolo PHANTOM, que sentó las bases teóricas para resolver el trilema de la escalabilidad sin sacrificar la descentralización ni la seguridad. A diferencia de las blockchains convencionales donde los bloques se encadenan de forma secuencial, en Kaspa múltiples bloques pueden coexistir y ser referenciados simultáneamente, lo que permite una velocidad de generación de bloques de un segundo e incluso inferior. Esta arquitectura elimina los bloques huérfanos y aprovecha todo el trabajo de los mineros, haciendo que la red sea más eficiente. Kaspa utiliza prueba de trabajo basada en el algoritmo kHeavyHash, optimizado para minería con GPU, lo que favorece una distribución más equitativa del poder de hash. El proyecto se lanzó sin preminado, sin ICO y sin asignación a fundadores, siguiendo una filosofía de distribución justa inspirada en los principios originales de Bitcoin. Su comunidad ha crecido de forma orgánica, atrayendo a mineros y desarrolladores que valoran la transparencia y la descentralización real. La hoja de ruta incluye la implementación de contratos inteligentes y mejoras adicionales de escalabilidad. Para los inversores, KAS representa una apuesta por una tecnología blockchain de nueva generación que busca ofrecer la seguridad de la prueba de trabajo con una escalabilidad que las cadenas tradicionales no pueden alcanzar.',

  'NEAR': 'NEAR Protocol es una plataforma blockchain de capa uno diseñada para ser rápida, segura y fácil de usar tanto para desarrolladores como para usuarios finales. Fue fundada en 2018 por Alexander Skidanov e Illia Polosukhin, este último reconocido como coautor del artículo de investigación que introdujo la arquitectura Transformer, fundamental para la inteligencia artificial moderna. NEAR utiliza un mecanismo de consenso llamado Nightshade, una variante de prueba de participación con fragmentación (sharding) dinámica que permite a la red escalar horizontalmente a medida que crece la demanda, procesando miles de transacciones por segundo con comisiones extremadamente bajas. Una de las características distintivas de NEAR es su enfoque en la experiencia de usuario: las direcciones de las carteras son nombres legibles en lugar de cadenas hexadecimales, y el sistema de cuentas permite recuperar el acceso sin depender exclusivamente de claves privadas. Su criptomoneda nativa, NEAR, se emplea para pagar comisiones de transacción, participar en staking y gobernar el protocolo. El ecosistema de NEAR ha atraído a numerosos proyectos DeFi, plataformas de NFT y aplicaciones descentralizadas, respaldado por financiación de fondos como Andreessen Horowitz, Tiger Global y otros inversores institucionales. La Fundación NEAR impulsa el desarrollo del protocolo y ofrece subvenciones a equipos que construyen sobre la plataforma. Para los inversores, NEAR ofrece exposición a una blockchain de alto rendimiento con un fuerte enfoque en la usabilidad y la escalabilidad, posicionándose como una infraestructura clave para la adopción masiva de aplicaciones descentralizadas.',

  'ADA': 'Cardano es una plataforma blockchain de tercera generación fundada por Charles Hoskinson, cofundador de Ethereum, y desarrollada por la empresa IOHK (Input Output Hong Kong). Lanzada en septiembre de 2017, Cardano se distingue por su enfoque académico y científico: cada componente del protocolo es diseñado mediante investigación revisada por pares y verificado formalmente antes de su implementación. Su criptomoneda nativa, ADA, lleva el nombre de Ada Lovelace, considerada la primera programadora de la historia. Cardano utiliza Ouroboros, el primer protocolo de prueba de participación con seguridad demostrada matemáticamente, lo que lo hace energéticamente eficiente mientras mantiene garantías de seguridad comparables a la prueba de trabajo. La plataforma se ha desarrollado en fases con nombres de figuras históricas: Byron (fundación), Shelley (descentralización), Goguen (contratos inteligentes), Basho (escalabilidad) y Voltaire (gobernanza). Desde la actualización Alonzo en 2021, Cardano soporta contratos inteligentes escritos en Plutus, un lenguaje basado en Haskell que ofrece mayor seguridad en la verificación de programas. Su ecosistema DeFi ha ido creciendo con intercambios descentralizados, plataformas de préstamos y mercados de NFT. Cardano también ha expandido su presencia en mercados emergentes, especialmente en África, donde ha establecido colaboraciones para soluciones de identidad digital y trazabilidad. Para los inversores, ADA representa una apuesta por un desarrollo blockchain metodológico y riguroso, con una comunidad activa y una visión a largo plazo centrada en la inclusión financiera global.',

  'DOT': 'Polkadot es un protocolo de interoperabilidad blockchain creado por Gavin Wood, cofundador de Ethereum y creador del lenguaje de programación Solidity. Fue lanzado en mayo de 2020 a través de la Web3 Foundation, con el objetivo de resolver uno de los problemas fundamentales del ecosistema blockchain: la falta de comunicación entre diferentes cadenas. La arquitectura de Polkadot se compone de una cadena principal llamada Relay Chain, que proporciona seguridad compartida y consenso, y múltiples cadenas paralelas llamadas parachains, que pueden tener sus propias reglas y optimizaciones específicas para diferentes casos de uso. Su criptomoneda nativa, DOT, cumple tres funciones principales: gobernanza del protocolo, participación en staking para la seguridad de la red, y vinculación (bonding) para conectar nuevas parachains. El mecanismo de consenso de Polkadot, conocido como GRANDPA combinado con BABE, permite finalidad determinista rápida mientras mantiene alta capacidad de procesamiento. Los slots de parachains se asignan mediante subastas, donde los proyectos compiten bloqueando DOT para asegurar su conexión a la red. El ecosistema de Polkadot incluye cientos de proyectos que abarcan DeFi, identidad digital, Internet de las cosas y cadenas de suministro. Substrate, el framework de desarrollo creado por Parity Technologies, permite construir blockchains personalizadas compatibles con Polkadot de manera eficiente. Para los inversores, DOT ofrece exposición a la visión de una web descentralizada donde múltiples blockchains especializadas colaboran de forma nativa.',

  'AVAX': 'Avalanche es una plataforma blockchain de código abierto lanzada en septiembre de 2020 por Ava Labs, empresa fundada por Emin Gün Sirer, profesor de la Universidad de Cornell reconocido por sus contribuciones a la investigación en sistemas distribuidos y criptomonedas. Avalanche introduce una familia de protocolos de consenso denominada Snow, que permite alcanzar la finalidad de las transacciones en menos de dos segundos con un consumo energético mínimo, manteniendo al mismo tiempo un alto grado de descentralización. La arquitectura de Avalanche se estructura en tres cadenas especializadas: la X-Chain para la creación e intercambio de activos digitales, la C-Chain compatible con la máquina virtual de Ethereum para contratos inteligentes, y la P-Chain para la coordinación de validadores y subredes. Las subredes (subnets) son una innovación clave que permite a empresas e instituciones crear sus propias blockchains personalizadas dentro del ecosistema de Avalanche, con sus propias reglas de validación y requisitos de cumplimiento normativo. Su criptomoneda nativa, AVAX, se utiliza para pagar comisiones de transacción, participar en staking y gobernar el protocolo. Avalanche ha atraído un ecosistema considerable de proyectos DeFi, juegos blockchain y aplicaciones empresariales, con integraciones de instituciones financieras tradicionales que aprovechan las subredes para tokenización de activos. La compatibilidad con Ethereum permite a los desarrolladores migrar sus aplicaciones fácilmente. Para los inversores, AVAX representa una plataforma de contratos inteligentes con tecnología de consenso innovadora y un enfoque dual que combina la descentralización pública con soluciones empresariales privadas.',

  'MATIC': 'Polygon, anteriormente conocido como Matic Network, es una plataforma de escalabilidad para Ethereum fundada en 2017 por Jaynti Kanani, Sandeep Nailwal y Anurag Arjun en India. Su objetivo principal es resolver los problemas de congestión, altas comisiones y lentitud que afectan a la red Ethereum, ofreciendo soluciones de segunda capa que procesan transacciones fuera de la cadena principal mientras heredan su seguridad. Polygon comenzó como una implementación de Plasma y cadenas laterales con prueba de participación, pero ha evolucionado para convertirse en un ecosistema integral de soluciones de escalabilidad que incluye tecnologías de conocimiento cero (zero-knowledge). Su criptomoneda nativa, MATIC (que mantiene su nombre original), se utiliza para pagar comisiones de transacción en la red, participar en el staking y en la gobernanza del protocolo. La cadena PoS de Polygon procesa transacciones con comisiones de fracciones de céntimo y tiempos de confirmación de aproximadamente dos segundos, lo que la ha convertido en una de las redes más utilizadas del ecosistema cripto. Miles de aplicaciones descentralizadas operan sobre Polygon, incluyendo plataformas DeFi como Aave y Uniswap, mercados de NFT como OpenSea, y juegos blockchain. Grandes empresas como Starbucks, Nike y Reddit han elegido Polygon para sus iniciativas Web3. La hoja de ruta de Polygon se centra en la tecnología de pruebas de conocimiento cero, con productos como Polygon zkEVM que buscan ofrecer escalabilidad con la seguridad completa de Ethereum. Para los inversores, MATIC ofrece exposición directa al crecimiento y la escalabilidad del ecosistema Ethereum.',

  'LINK': 'Chainlink es una red de oráculos descentralizada creada por Sergey Nazarov y Steve Ellis, lanzada en junio de 2017 tras una oferta inicial de monedas que recaudó 32 millones de dólares. Su propósito fundamental es resolver el problema del oráculo en las blockchains: los contratos inteligentes no pueden acceder por sí mismos a datos del mundo exterior, y Chainlink actúa como puente seguro entre la información fuera de la cadena y las aplicaciones descentralizadas. La red opera mediante nodos independientes que recopilan datos de múltiples fuentes, los agregan y los entregan a los contratos inteligentes de manera verificable y resistente a la manipulación. Su criptomoneda nativa, LINK, se utiliza para pagar a los operadores de nodos por sus servicios y como garantía que los nodos depositan para asegurar la fiabilidad de los datos que proporcionan. Chainlink se ha convertido en la infraestructura de oráculos estándar de la industria, asegurando miles de millones de dólares en valor a través de protocolos DeFi en múltiples blockchains como Ethereum, Polygon, Avalanche, Arbitrum y muchas otras. Sus productos incluyen Price Feeds para datos de precios en tiempo real, VRF para generación de números aleatorios verificables, Automation para la ejecución automatizada de contratos, y CCIP (Cross-Chain Interoperability Protocol) para comunicación entre cadenas. Instituciones financieras tradicionales como SWIFT han colaborado con Chainlink para explorar la integración de la infraestructura blockchain. Para los inversores, LINK representa una posición en la capa de infraestructura crítica que conecta el mundo real con la economía descentralizada.',

  'XRP': 'XRP es el activo digital nativo de XRP Ledger, un registro distribuido de código abierto creado en 2012 por Jed McCaleb, Arthur Britto y David Schwartz. A diferencia de la mayoría de las criptomonedas, XRP no utiliza minería ni prueba de participación: su mecanismo de consenso, conocido como el Protocolo de Consenso de XRP Ledger, se basa en una red de validadores de confianza que confirman las transacciones en aproximadamente tres a cinco segundos con comisiones casi nulas. La totalidad de los 100 mil millones de tokens XRP fueron creados en el génesis del ledger, eliminando la emisión continua. Ripple Labs, la empresa más estrechamente asociada con XRP, ha utilizado el activo como puente para facilitar transferencias internacionales de dinero, permitiendo a las instituciones financieras liquidar pagos transfronterizos de manera instantánea y a una fracción del coste de los sistemas tradicionales como SWIFT. XRP Ledger también soporta la emisión de tokens personalizados, un intercambio descentralizado integrado y, más recientemente, funcionalidades de contratos inteligentes. El activo ha sido objeto de un prolongado litigio regulatorio con la SEC de Estados Unidos, cuya resolución ha tenido un impacto significativo en la definición del marco legal de los activos digitales. Centenares de instituciones financieras en todo el mundo han explorado o adoptado la tecnología de Ripple para sus corredores de pago. Para los inversores, XRP ofrece exposición a la intersección entre la tecnología blockchain y el sistema financiero tradicional, con un enfoque específico en la modernización de los pagos internacionales.',

  'DOGE': 'Dogecoin es una criptomoneda creada en diciembre de 2013 por los ingenieros de software Billy Markus y Jackson Palmer, originalmente concebida como una parodia humorística de Bitcoin inspirada en el popular meme del perro Shiba Inu. A pesar de sus orígenes satíricos, Dogecoin se ha convertido en una de las criptomonedas más reconocidas y con mayor capitalización de mercado del mundo. Técnicamente, Dogecoin es un fork de Litecoin que utiliza el algoritmo de minería Scrypt con prueba de trabajo, y a diferencia de Bitcoin no tiene un suministro máximo fijo, emitiendo aproximadamente 5.000 millones de nuevos DOGE cada año, lo que le confiere un carácter ligeramente inflacionario diseñado para incentivar el gasto en lugar del atesoramiento. Las transacciones en la red Dogecoin se confirman en aproximadamente un minuto con comisiones muy reducidas, lo que la hace práctica para micropagos y propinas en línea. La comunidad de Dogecoin ha sido históricamente una de las más activas y solidarias del ecosistema cripto, organizando campañas benéficas y patrocinando eventos deportivos. El activo ganó una atención mediática sin precedentes cuando figuras públicas como Elon Musk expresaron su apoyo públicamente, impulsando su valor de mercado y la adopción por parte de comercios que lo aceptan como medio de pago. El desarrollo de Dogecoin continúa con la Dogecoin Foundation y colaboradores que trabajan en mejoras de la red. Para los inversores, DOGE representa un activo con una comunidad leal y un reconocimiento de marca excepcional en el mundo de las criptomonedas.',

  'SHIB': 'Shiba Inu es un token basado en la red Ethereum creado en agosto de 2020 por un desarrollador anónimo conocido como Ryoshi. Inspirado en Dogecoin y denominado el Dogecoin Killer por su comunidad, Shiba Inu se lanzó con un suministro inicial de un cuadrillón de tokens, de los cuales la mitad fue enviada a la cartera del cofundador de Ethereum, Vitalik Buterin, quien posteriormente quemó una parte significativa y donó el resto a causas benéficas. SHIB opera como un token ERC-20 en la blockchain de Ethereum, lo que le permite integrarse con todo el ecosistema de aplicaciones descentralizadas y contratos inteligentes de esta red. El proyecto ha evolucionado más allá de ser un simple token meme para desarrollar su propio ecosistema que incluye ShibaSwap, un intercambio descentralizado; tokens complementarios como LEASH y BONE con funciones específicas de gobernanza y recompensas; y Shibarium, una solución de capa dos diseñada para reducir las comisiones de transacción y aumentar la velocidad de procesamiento. La comunidad de Shiba Inu, autodenominada ShibArmy, es una de las más numerosas del espacio cripto y ha impulsado la adopción del token como medio de pago en comercios y plataformas de todo el mundo. El mecanismo de quema de tokens busca reducir progresivamente el suministro circulante para generar presión deflacionaria. Para los inversores, SHIB representa una exposición al fenómeno de los tokens comunitarios con un ecosistema en expansión que busca aportar utilidad real más allá de su origen como moneda meme.',

  'UNI': 'Uniswap es un protocolo de intercambio descentralizado (DEX) construido sobre Ethereum que fue creado por Hayden Adams y lanzado en noviembre de 2018. Revolucionó el comercio de criptomonedas al introducir el modelo de creador de mercado automatizado (AMM), eliminando la necesidad de libros de órdenes tradicionales y permitiendo a cualquier usuario intercambiar tokens directamente desde su cartera sin intermediarios. En el modelo AMM, los usuarios proporcionan liquidez depositando pares de tokens en pools y reciben comisiones proporcionales a su participación por cada operación que se ejecuta en ese pool. Su token de gobernanza, UNI, fue distribuido retroactivamente en septiembre de 2020 a todos los usuarios históricos del protocolo en uno de los airdrops más significativos de la historia de las criptomonedas. Los poseedores de UNI tienen derecho a votar sobre propuestas de gobernanza que determinan la dirección del protocolo, incluyendo la gestión de su tesorería y las actualizaciones del mismo. Uniswap ha pasado por múltiples versiones: V2 introdujo los pares de tokens arbitrarios, V3 añadió la liquidez concentrada que mejoró drásticamente la eficiencia del capital, y V4 introduce hooks personalizables que permiten a los desarrolladores añadir lógica personalizada a los pools. El protocolo se ha expandido a múltiples cadenas incluyendo Polygon, Arbitrum, Optimism y Base, procesando volúmenes diarios de miles de millones de dólares. Para los inversores, UNI ofrece exposición al protocolo de intercambio descentralizado líder del mercado y a la gobernanza de una de las infraestructuras más importantes del ecosistema DeFi.',

  'ATOM': 'Cosmos es un ecosistema de blockchains interconectadas cuyo desarrollo fue iniciado por Jae Kwon y Ethan Buchman, con el lanzamiento de la red principal en marzo de 2019. Su visión central es crear un Internet de Blockchains donde diferentes redes pueden comunicarse e intercambiar valor de forma nativa, resolviendo el problema de la fragmentación del ecosistema blockchain. La arquitectura de Cosmos se fundamenta en tres componentes clave: Tendermint Core, un motor de consenso bizantino tolerante a fallos que proporciona finalidad rápida; el Cosmos SDK, un framework modular que permite a los desarrolladores construir blockchains personalizadas de manera eficiente; y el protocolo IBC (Inter-Blockchain Communication), que habilita la transferencia segura de datos y tokens entre cadenas independientes conectadas al ecosistema. Su criptomoneda nativa, ATOM, se utiliza para asegurar el Cosmos Hub mediante staking, participar en la gobernanza del protocolo y pagar las comisiones de transacción. El Cosmos Hub actúa como centro de interconexión, aunque cada blockchain del ecosistema (llamada zona) opera de forma soberana con sus propios validadores y reglas de gobernanza. Decenas de blockchains prominentes han sido construidas con el Cosmos SDK, incluyendo Binance Chain, Cronos, Osmosis, Injective y Terra, demostrando la versatilidad del framework. El ecosistema ha crecido para incluir cientos de aplicaciones que abarcan DeFi, NFT y aplicaciones específicas de dominio. Para los inversores, ATOM ofrece exposición a la infraestructura de interoperabilidad del ecosistema blockchain y al crecimiento de una de las comunidades de desarrollo más productivas del sector.',

  'FTM': 'Fantom es una plataforma blockchain de alto rendimiento fundada por el científico informático surcoreano Ahn Byung Ik en 2018, con su red principal lanzada en diciembre de 2019. La innovación central de Fantom es su mecanismo de consenso Lachesis, un protocolo asíncrono basado en un grafo acíclico dirigido (DAG) que permite alcanzar la finalidad de las transacciones en aproximadamente un segundo con comisiones extremadamente bajas. A diferencia de los mecanismos de consenso síncronos tradicionales, Lachesis permite que los nodos procesen transacciones de forma independiente y las confirmen sin esperar a que toda la red alcance un acuerdo simultáneo, lo que incrementa significativamente el rendimiento. Fantom Opera, la red principal, es compatible con la máquina virtual de Ethereum (EVM), lo que permite a los desarrolladores desplegar contratos inteligentes escritos en Solidity sin necesidad de modificaciones, facilitando la migración de proyectos desde Ethereum. Su criptomoneda nativa, FTM, se utiliza para pagar comisiones de transacción, participar en staking con recompensas para los validadores, y en la gobernanza descentralizada del protocolo. El ecosistema de Fantom ha desarrollado un sector DeFi significativo, con protocolos de préstamos, intercambios descentralizados y optimizadores de rendimiento que han atraído miles de millones en valor total bloqueado. La Fundación Fantom ha implementado programas de incentivos para atraer desarrolladores y proyectos. La hoja de ruta incluye Fantom Sonic, una actualización significativa que promete mejorar aún más el rendimiento y la escalabilidad. Para los inversores, FTM representa una blockchain de capa uno con tecnología de consenso diferenciada y un ecosistema DeFi activo.',

  'ALGO': 'Algorand es una blockchain de capa uno fundada por Silvio Micali, profesor del MIT y ganador del Premio Turing en 2012 por sus contribuciones fundamentales a la criptografía moderna. Lanzada en junio de 2019, Algorand fue diseñada para resolver simultáneamente el trilema de la blockchain: escalabilidad, seguridad y descentralización. Su mecanismo de consenso, llamado Pure Proof of Stake (PPoS), selecciona aleatoria y secretamente a los participantes para proponer y validar bloques, haciendo que el proceso sea democrático, eficiente y resistente a ataques. Las transacciones en Algorand se finalizan en menos de cuatro segundos y son irreversibles desde el momento de la confirmación, eliminando el riesgo de reorganización de la cadena. Su criptomoneda nativa, ALGO, se utiliza para pagar las comisiones de transacción y participar en el consenso de la red. Algorand soporta contratos inteligentes mediante AVM (Algorand Virtual Machine) y facilita la creación de activos digitales estándar (ASA) que pueden representar desde tokens fungibles hasta NFT y activos financieros tokenizados. La plataforma ha ganado tracción significativa en el sector de las finanzas institucionales, con bancos centrales que han elegido Algorand para proyectos piloto de monedas digitales (CBDC), y empresas de diversos sectores que utilizan su infraestructura para la tokenización de activos del mundo real. La Fundación Algorand impulsa la adopción mediante programas de subvenciones, asociaciones académicas y colaboraciones empresariales en todo el mundo. Para los inversores, ALGO ofrece exposición a una blockchain con credenciales académicas excepcionales y un enfoque en casos de uso institucionales y de activos del mundo real.',
};

const CRYPTO_IDS: Record<string, string> = {
  'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana',
  'KAS': 'kaspa', 'KASPA': 'kaspa', 'NEAR': 'near',
  'ADA': 'cardano', 'DOT': 'polkadot', 'AVAX': 'avalanche-2',
  'MATIC': 'matic-network', 'LINK': 'chainlink', 'XRP': 'ripple',
  'DOGE': 'dogecoin', 'SHIB': 'shiba-inu', 'UNI': 'uniswap',
  'ATOM': 'cosmos', 'FTM': 'fantom', 'ALGO': 'algorand',
};

const CASH_DESCRIPTION = `La cuenta corriente es el lugar donde guardamos nuestro dinero líquido para el día a día, pero tiene un coste oculto: la inflación. Cada año que tu dinero permanece parado en una cuenta sin rentabilidad, pierde poder adquisitivo. Con una inflación del 3% anual, 10.000€ hoy equivalen a unos 7.400€ en poder de compra dentro de 10 años. Por eso es fundamental no dejar el dinero parado: como mínimo, una cuenta remunerada o un fondo monetario puede compensar parte de esa pérdida mientras mantienes la liquidez. Incluir la cuenta corriente en el seguimiento de tu patrimonio te ayuda a visualizar exactamente cuánto capital está dormido y tomar decisiones informadas sobre dónde moverlo.`;

export async function getAssetInfo(symbol: string): Promise<AssetInfo> {
  const cached = infoCache.get(symbol);
  if (cached && Date.now() - cached.ts < INFO_CACHE_TTL) return cached.data;

  const base: AssetInfo = {
    symbol,
    name: symbol,
    type: 'unknown',
    sector: null,
    description: null,
    logoUrl: null,
    exchange: null,
    currency: null,
    currentPrice: null,
    previousClose: null,
    dayChange: null,
    dayChangePercent: null,
  };

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await fetchWithTimeout(url, { headers: YAHOO_HEADERS });
    if (res.ok) {
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta) {
        base.name = meta.longName || meta.shortName || symbol;
        base.exchange = meta.exchangeName || null;
        base.currency = meta.currency || null;
        base.currentPrice = meta.regularMarketPrice ?? null;
        base.previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
        base.type = meta.instrumentType?.toLowerCase() || guessType(symbol);

        if (base.currentPrice != null && base.previousClose != null && base.previousClose > 0) {
          base.dayChange = base.currentPrice - base.previousClose;
          base.dayChangePercent = (base.dayChange / base.previousClose) * 100;
        }
      }
    }
  } catch {}

  try {
    const searchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=1&newsCount=0`;
    const searchRes = await fetchWithTimeout(searchUrl, { headers: YAHOO_HEADERS });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const quote = searchData?.quotes?.[0];
      if (quote) {
        if (!base.name || base.name === symbol) base.name = quote.longname || quote.shortname || base.name;
        if (!base.sector) base.sector = quote.sector || quote.industry || null;
        if (quote.quoteType) base.type = quote.quoteType.toLowerCase();
      }
    }
  } catch {}

  if (base.type === 'cryptocurrency' || symbol.includes('-') || symbol.includes('=')) {
    base.logoUrl = null;
  } else {
    base.logoUrl = `https://logo.clearbit.com/${guessDomain(base.name, symbol)}`;
  }

  base.description = await getDescription(symbol, base.name, base.type);

  infoCache.set(symbol, { data: base, ts: Date.now() });
  return base;
}

async function getDescription(symbol: string, name: string, type: string): Promise<string | null> {
  const cacheKey = symbol.toUpperCase();
  console.log(`[asset-info] getDescription called: symbol="${symbol}", name="${name}", type="${type}"`);

  if (descriptionCache.has(cacheKey)) {
    console.log(`[asset-info] ${cacheKey}: hit in-memory cache`);
    return descriptionCache.get(cacheKey)!;
  }

  if (type === 'cash' || symbol === 'EFECTIVO') {
    console.log(`[asset-info] ${cacheKey}: detected as cash`);
    descriptionCache.set(cacheKey, CASH_DESCRIPTION);
    return CASH_DESCRIPTION;
  }

  try {
    const docRef = admin.firestore().collection('assetDescriptions').doc(cacheKey);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const text = docSnap.data()?.description as string;
      if (text) {
        console.log(`[asset-info] ${cacheKey}: hit Firestore cache (${text.length} chars)`);
        descriptionCache.set(cacheKey, text);
        return text;
      }
    }
  } catch (e: any) {
    console.error(`[asset-info] Firestore read error for ${cacheKey}:`, e.message);
  }

  const staticKey = symbol.split(/[-=]/)[0].toUpperCase();
  if (STATIC_DESCRIPTIONS[staticKey]) {
    const text = STATIC_DESCRIPTIONS[staticKey];
    console.log(`[asset-info] ${cacheKey}: hit static description for ${staticKey}`);
    descriptionCache.set(cacheKey, text);
    try {
      await admin.firestore().collection('assetDescriptions').doc(cacheKey).set({
        symbol: cacheKey,
        name,
        type,
        description: text,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e: any) {
      console.error(`[asset-info] Firestore write error for ${cacheKey}:`, e.message);
    }
    return text;
  }

  const isCrypto = type === 'cryptocurrency' || symbol.includes('-') || symbol.includes('=');
  console.log(`[asset-info] ${cacheKey}: isCrypto=${isCrypto}, will ${isCrypto ? 'try CoinGecko first' : 'skip CoinGecko, go to Anthropic'}`);
  let description: string | null = null;

  if (isCrypto) {
    description = await fetchCoinGeckoDescription(symbol);
    console.log(`[asset-info] ${cacheKey}: CoinGecko result: ${description ? `OK (${description.length} chars)` : 'null'}`);
  }

  if (!description) {
    console.log(`[asset-info] ${cacheKey}: falling back to Anthropic (ANTHROPIC_API_KEY ${process.env.ANTHROPIC_API_KEY ? 'is set' : 'NOT SET'})`);
    description = await generateDescriptionWithAnthropic(symbol, name, type);
    console.log(`[asset-info] ${cacheKey}: Anthropic result: ${description ? `OK (${description.length} chars)` : 'null'}`);
  }

  if (description) {
    descriptionCache.set(cacheKey, description);
    try {
      await admin.firestore().collection('assetDescriptions').doc(cacheKey).set({
        symbol: cacheKey,
        name,
        type,
        description,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e: any) {
      console.error(`[asset-info] Firestore write error for ${cacheKey}:`, e.message);
    }
  }

  return description;
}

async function fetchCoinGeckoDescription(symbol: string): Promise<string | null> {
  try {
    const base = symbol.split(/[-=]/)[0].toUpperCase();
    const cgId = CRYPTO_IDS[base] || base.toLowerCase();
    console.log(`[asset-info] CoinGecko: fetching coin "${cgId}" (from symbol "${symbol}", base "${base}")`);
    const res = await fetchWithTimeout(
      `https://api.coingecko.com/api/v3/coins/${cgId}?localization=true&tickers=false&market_data=false&community_data=false&developer_data=false`,
      {},
      8000,
    );
    if (!res.ok) {
      console.warn(`[asset-info] CoinGecko: HTTP ${res.status} for "${cgId}"`);
      return null;
    }
    const data = await res.json();

    const descEs = data?.description?.es;
    const descEn = data?.description?.en;
    console.log(`[asset-info] CoinGecko "${cgId}": es=${descEs?.length ?? 0} chars, en=${descEn?.length ?? 0} chars`);
    const rawDesc = (descEs && descEs.length > 50) ? descEs : descEn;
    if (!rawDesc || rawDesc.length < 30) return null;

    const cleaned = rawDesc.replace(/<[^>]*>/g, '').replace(/\r\n/g, '\n').trim();

    if (!descEs || descEs.length < 50) {
      const translated = await translateWithAnthropic(cleaned, symbol);
      if (translated) return trimToWordLimit(translated, 300);
      console.warn(`[asset-info] CoinGecko "${cgId}": Anthropic translation failed, using English description as fallback`);
    }

    return trimToWordLimit(cleaned, 300);
  } catch (e: any) {
    console.error(`[asset-info] CoinGecko description error for ${symbol}:`, e.message);
    return null;
  }
}

async function generateDescriptionWithAnthropic(symbol: string, name: string, type: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[asset-info] ANTHROPIC_API_KEY not set, skipping description generation');
    return null;
  }

  const displayName = name && name !== symbol ? name : symbol;
  const prompt = `Escribe un párrafo de 250 palabras en español sobre ${displayName} (${symbol}), de tipo ${type}: qué es, cómo surgió y cuál es su objetivo como activo financiero. Solo el párrafo, sin título ni markdown.`;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = message.content.find(b => b.type === 'text');
    const text = block && block.type === 'text' ? block.text.trim() : null;
    if (text && text.length > 100) return trimToWordLimit(text, 300);
  } catch (e: any) {
    console.error(`[asset-info] Anthropic generation error for ${symbol}:`, e.message);
  }
  return null;
}

async function translateWithAnthropic(text: string, symbol: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: `Traduce el siguiente texto sobre ${symbol} al español. Mantén el tono informativo y profesional. Devuelve SOLO la traducción, sin notas ni comentarios:\n\n${text.slice(0, 3000)}` }],
    });
    const block = message.content.find(b => b.type === 'text');
    return block && block.type === 'text' ? block.text.trim() || null : null;
  } catch (e: any) {
    console.error(`[asset-info] Anthropic translation error:`, e.message);
    return null;
  }
}

function trimToWordLimit(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  const trimmed = words.slice(0, maxWords).join(' ');
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot > trimmed.length * 0.7) return trimmed.slice(0, lastDot + 1);
  return trimmed + '...';
}

function guessType(symbol: string): string {
  if (symbol.includes('-') || symbol.includes('=')) return 'cryptocurrency';
  return 'equity';
}

function guessDomain(name: string, symbol: string): string {
  const clean = name.toLowerCase()
    .replace(/,?\s*(inc|corp|ltd|llc|plc|sa|ag|se|nv|co|group|holdings|international)\.?/gi, '')
    .trim()
    .split(/\s+/)[0];
  if (clean && clean.length > 2) return `${clean}.com`;
  return `${symbol.toLowerCase()}.com`;
}
